/******************************************************************************/

import {
    broadcastMessage,
    isDescendantHostnameOfIter,
} from './utils.js';
import {
    browser,
    localRead, localWrite,
    sessionRead, sessionWrite,
} from './ext.js';
import { adminReadEx } from './admin.js';
import { filteringModesToDNR } from './ruleset-manager.js';

export const MODE_NONE    = 0;
export const MODE_BASIC   = 1;
export const MODE_OPTIMAL = 2;
export const MODE_COMPLETE = 3;

// Вспомогательные функции
const pruneDescendantHostnamesFromSet = (hostname, hnSet) => {
    for (const hn of hnSet) {
        if (hn === hostname) continue;
        if (hn.endsWith(hostname) && hn[hn.length - hostname.length - 1] === '.') {
            hnSet.delete(hn);
        }
    }
};

const pruneHostnameFromSet = (hostname, hnSet) => {
    let hn = hostname;
    while (hn) {
        hnSet.delete(hn);
        const pos = hn.indexOf('.');
        if (pos === -1) break;
        hn = hn.slice(pos + 1);
    }
};

const serializeModeDetails = details => ({
    none: Array.from(details.none),
    basic: Array.from(details.basic),
    optimal: Array.from(details.optimal),
    complete: Array.from(details.complete)
});

function toSet(arr) {
    return new Set(Array.isArray(arr) ? arr : []);
}

const unserializeModeDetails = details => {
    return {
        none: toSet(details?.none),
        basic: toSet(details?.basic),
        optimal: toSet(details?.optimal),
        complete: toSet(details?.complete)
    };
};

function lookupFilteringMode(filteringModes, hostname) {
    const { none, basic, optimal, complete } = filteringModes;
    if (hostname === 'all-urls') {
        if (none.has('all-urls')) return MODE_NONE;
        if (basic.has('all-urls')) return MODE_BASIC;
        if (optimal.has('all-urls')) return MODE_OPTIMAL;
        if (complete.has('all-urls')) return MODE_COMPLETE;
        return MODE_BASIC;
    }
    // Для любого другого hostname проверяем только whitelist
    if (none.has(hostname) || isDescendantHostnameOfIter(hostname, none)) {
        return MODE_NONE;
    }
    // Иначе возвращаем глобальный режим
    return lookupFilteringMode(filteringModes, 'all-urls');
}

function applyFilteringMode(filteringModes, hostname, afterLevel) {
    const defaultLevel = lookupFilteringMode(filteringModes, 'all-urls');
    if (hostname === 'all-urls') {
        // Меняем глобальный режим
        if (afterLevel === defaultLevel) return afterLevel;
        const { none, basic, optimal, complete } = filteringModes;
        // Очищаем all-urls из всех сетов
        none.delete('all-urls');
        basic.delete('all-urls');
        optimal.delete('all-urls');
        complete.delete('all-urls');
        // Устанавливаем новый
        switch (afterLevel) {
            case MODE_NONE:    none.add('all-urls'); break;
            case MODE_BASIC:   basic.add('all-urls'); break;
            case MODE_OPTIMAL: optimal.add('all-urls'); break;
            case MODE_COMPLETE: complete.add('all-urls'); break;
        }
        return lookupFilteringMode(filteringModes, 'all-urls');
    } else {
        // Для других hostname разрешаем только добавление/удаление из whitelist
        if (afterLevel === MODE_NONE) {
            // Добавляем в none
            const { none } = filteringModes;
            if (!none.has(hostname) && !isDescendantHostnameOfIter(hostname, none)) {
                none.add(hostname);
                pruneDescendantHostnamesFromSet(hostname, none);
            }
        } else {
            // Удаляем из whitelist, если он там был
            const { none } = filteringModes;
            if (none.has(hostname)) {
                none.delete(hostname);
            } else if (isDescendantHostnameOfIter(hostname, none)) {
                // Если hostname является поддоменом whitelist-домена, ничего не делаем
                // (можно добавить логику удаления, если нужно, но для простоты оставим)
            }
        }
        return lookupFilteringMode(filteringModes, hostname);
    }
}

// Чтение/запись деталей
export async function readFilteringModeDetails(bypassCache = false) {
    if (bypassCache === false && readFilteringModeDetails.cache) {
        return readFilteringModeDetails.cache;
    }

    // Пытаемся прочитать из session (быстрый кеш)
    let sessionModes = await sessionRead('filteringModeDetails');
    if (sessionModes) {
        readFilteringModeDetails.cache = unserializeModeDetails(sessionModes);
        return readFilteringModeDetails.cache;
    }

    // Читаем из локального хранилища
    let userModes = await localRead('filteringModeDetails');
    if (!userModes) {
        // Значения по умолчанию: базовый режим для всех сайтов
        userModes = {
            none: [],
            basic: ['all-urls'],
            optimal: [],
            complete: []
        };
    } else {
        // Если сохранённые данные — старый формат, преобразуем
        userModes = unserializeModeDetails(userModes);
    }

    // Применяем административные настройки (noFiltering)
    const adminNoFiltering = await adminReadEx('noFiltering');
    if (Array.isArray(adminNoFiltering)) {
        for (const entry of adminNoFiltering) {
            if (entry === '-*') {
                userModes.none.clear();
            } else if (entry.startsWith('-')) {
                userModes.none.delete(entry.slice(1));
            } else {
                userModes.none.add(entry);
            }
        }
    }

    // Обновляем DNR на основе новых настроек
    await filteringModesToDNR(userModes);

    // Сохраняем в session и кеш
    const serialized = serializeModeDetails(userModes);
    await sessionWrite('filteringModeDetails', serialized);
    readFilteringModeDetails.cache = userModes;
    return userModes;
}

async function writeFilteringModeDetails(afterDetails) {
    // Обновляем DNR на основе новых настроек
    await filteringModesToDNR(afterDetails);

    // Сериализуем для хранения
    const data = serializeModeDetails(afterDetails);
    await Promise.all([
        localWrite('filteringModeDetails', data),
        sessionWrite('filteringModeDetails', data)
    ]);

    // Обновляем кеш
    readFilteringModeDetails.cache = afterDetails;

    // Оповещаем другие части расширения
    broadcastMessage({
        defaultFilteringMode: await getDefaultFilteringMode(),
        trustedSites: Array.from(afterDetails.none)
    });
}

export async function getFilteringModeDetails() {
    return readFilteringModeDetails();
}

export async function getFilteringMode(hostname) {
    const filteringModes = await getFilteringModeDetails();
    return lookupFilteringMode(filteringModes, hostname);
}

export async function setFilteringMode(hostname, afterLevel) {
    const filteringModes = await getFilteringModeDetails();
    const level = applyFilteringMode(filteringModes, hostname, afterLevel);
    await writeFilteringModeDetails(filteringModes);
    return level;
}

export function getDefaultFilteringMode() {
    return getFilteringMode('all-urls');
}

export function setDefaultFilteringMode(afterLevel) {
    return setFilteringMode('all-urls', afterLevel);
}

export async function getTrustedSites() {
    const filteringModes = await getFilteringModeDetails();
    return filteringModes.none;
}

export async function setTrustedSites(hostnames) {
    const filteringModes = await getFilteringModeDetails();
    const { none } = filteringModes;
    // Удаляем все текущие, кроме all-urls
    for (const hn of none) {
        if (hn !== 'all-urls') none.delete(hn);
    }
    // Добавляем новые
    for (const hn of hostnames) {
        if (hn === 'all-urls') continue;
        none.add(hn);
    }
    await writeFilteringModeDetails(filteringModes);
}

export async function syncWithBrowserPermissions() {
    // Оставляем без изменений или упрощаем
    return false;
}