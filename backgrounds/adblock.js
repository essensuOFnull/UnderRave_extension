/*******************************************************************************

    uBlock Origin Lite - a comprehensive, MV3-compliant content blocker
    Copyright (C) 2022-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

import {
    MODE_BASIC,
    MODE_OPTIMAL,
    getDefaultFilteringMode,
    getFilteringMode,
    getTrustedSites,
    setDefaultFilteringMode,
    setFilteringMode,
    setTrustedSites,
    syncWithBrowserPermissions,
} from '../popups/adblock/js/mode-manager.js';

import {
    adminRead,
    browser,
    dnr,
    localRead, localRemove, localWrite,
    runtime,
    windows,
} from '../popups/adblock/js/ext.js';

import {
    adminReadEx,
    getAdminRulesets,
} from '../popups/adblock/js/admin.js';

import {
    enableRulesets,
    excludeFromStrictBlock,
    getEnabledRulesetsDetails,
    getRulesetDetails,
    patchDefaultRulesets,
    setStrictBlockMode,
    updateDynamicRules,
    updateSessionRules,
} from '../popups/adblock/js/ruleset-manager.js';

import {
    getMatchedRules,
    isSideloaded,
    toggleDeveloperMode,
    ubolLog,
} from '../popups/adblock/js/debug.js';

import {
    loadRulesetConfig,
    process,
    rulesetConfig,
    saveRulesetConfig,
} from '../popups/adblock/js/config.js';

import { broadcastMessage } from '../popups/adblock/js/utils.js';
import { registerInjectables } from '../popups/adblock/js/scripting-manager.js';

// Какие rulesets включать для каждого режима
function getRulesetsForMode(mode) {
    // Базовые списки (всегда должны быть включены, кроме режима 0)
    const baseRulesets = ['default', 'badware', 'urlhaus-full', 'openphish-domains'];
    
    // Списки раздражителей (annoyances) – для режимов 2 и 3
    const annoyancesRulesets = [
        'annoyances-cookies',
        'annoyances-overlays',
        'annoyances-social',
        'annoyances-widgets',
        'annoyances-others'
    ];
    
    // Региональные списки – для режима 3 (или для 2, если хотите)
    // Здесь можно использовать функцию defaultRulesetsFromLanguage() для автоматического подбора
    // или задать статический список. Для примера возьмём несколько.
    const regionalRulesets = [
        'rus-0', 'rus-1', 'deu-0', 'fra-0', /* и т.д. */
    ];

    switch (mode) {
        case 0: // Нет фильтрации
            return []; // отключаем всё
        case 1: // Базовая
            return baseRulesets;
        case 2: // Оптимальная
            return [...baseRulesets, ...annoyancesRulesets];
        case 3: // Полная
            return [...baseRulesets, ...annoyancesRulesets, ...regionalRulesets];
        default:
            return baseRulesets;
    }
}
/******************************************************************************/

const UBOL_ORIGIN = runtime.getURL('').replace(/\/$/, '');

const canShowBlockedCount = typeof dnr.setExtensionActionOptions === 'function';

/******************************************************************************/

export function getCurrentVersion() {
    return runtime.getManifest().version;
}

/******************************************************************************/

export async function hasGreatPowers(origin) {
    if ( /^https?:\/\//.test(origin) === false ) { return false; }
    return browser.permissions.contains({
        origins: [ `${origin}/*` ],
    });
}

export async function hasOmnipotence() {
    const manifest = runtime.getManifest();
    const hasOmnipotence = Array.isArray(manifest.host_permissions) &&
        manifest.host_permissions.includes('<all_urls>');
    if ( hasOmnipotence ) { return true; }
    return browser.permissions.contains({
        origins: [ '<all_urls>' ],
    });
}

export async function onPermissionsRemoved() {
    const beforeMode = await getDefaultFilteringMode();
    const modified = await syncWithBrowserPermissions();
    if ( modified === false ) { return false; }
    const afterMode = await getDefaultFilteringMode();
    if ( beforeMode > MODE_BASIC && afterMode <= MODE_BASIC ) {
        updateDynamicRules();
    }
    registerInjectables();
    return true;
}

/******************************************************************************/

export async function gotoURL(url, type) {
    const pageURL = new URL(url, runtime.getURL('/'));
    const tabs = await browser.tabs.query({
        url: pageURL.href,
        windowType: type !== 'popup' ? 'normal' : 'popup'
    });

    if ( Array.isArray(tabs) && tabs.length !== 0 ) {
        const { windowId, id } = tabs[0];
        return Promise.all([
            browser.windows.update(windowId, { focused: true }),
            browser.tabs.update(id, { active: true }),
        ]);
    }

    if ( type === 'popup' ) {
        return windows.create({
            type: 'popup',
            url: pageURL.href,
        });
    }

    return browser.tabs.create({
        active: true,
        url: pageURL.href,
    });
}

/******************************************************************************/

export function onMessage(request, sender, callback) {

    // Does not require trusted origin.

    switch ( request.what ) {

    case 'insertCSS': {
        const tabId = sender?.tab?.id ?? false;
        const frameId = sender?.frameId ?? false;
        if ( tabId === false || frameId === false ) { return; }
        browser.scripting.insertCSS({
            css: request.css,
            origin: 'USER',
            target: { tabId, frameIds: [ frameId ] },
        }).catch(reason => {
            console.log(reason);
        });
        return false;
    }

    default:
        break;
    }

    // Does require trusted origin.

    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/MessageSender
    //   Firefox API does not set `sender.origin`
    if ( sender.origin !== undefined && sender.origin !== UBOL_ORIGIN ) { return; }

    switch ( request.what ) {

    case 'applyRulesets': {
        enableRulesets(request.enabledRulesets).then(( ) => {
            rulesetConfig.enabledRulesets = request.enabledRulesets;
            return saveRulesetConfig();
        }).then(( ) => {
            registerInjectables();
            callback();
            return dnr.getEnabledRulesets();
        }).then(enabledRulesets => {
            broadcastMessage({ enabledRulesets });
        });
        return true;
    }

    case 'getOptionsPageData': {
        Promise.all([
            getDefaultFilteringMode(),
            getTrustedSites(),
            getRulesetDetails(),
            dnr.getEnabledRulesets(),
            getAdminRulesets(),
            adminReadEx('disabledFeatures'),
        ]).then(results => {
            const [
                defaultFilteringMode,
                trustedSites,
                rulesetDetails,
                enabledRulesets,
                adminRulesets,
                disabledFeatures,
            ] = results;
            callback({
                defaultFilteringMode,
                trustedSites: Array.from(trustedSites),
                enabledRulesets,
                adminRulesets,
                maxNumberOfEnabledRulesets: dnr.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS,
                rulesetDetails: Array.from(rulesetDetails.values()),
                autoReload: rulesetConfig.autoReload,
                showBlockedCount: rulesetConfig.showBlockedCount,
                canShowBlockedCount,
                strictBlockMode: rulesetConfig.strictBlockMode,
                firstRun: process.firstRun,
                isSideloaded,
                developerMode: rulesetConfig.developerMode,
                disabledFeatures,
            });
            process.firstRun = false;
        });
        return true;
    }

    case 'setAutoReload':
        rulesetConfig.autoReload = request.state && true || false;
        saveRulesetConfig().then(( ) => {
            callback();
            broadcastMessage({ autoReload: rulesetConfig.autoReload });
        });
        return true;

    case 'setShowBlockedCount':
        rulesetConfig.showBlockedCount = request.state && true || false;
        if ( canShowBlockedCount ) {
            dnr.setExtensionActionOptions({
                displayActionCountAsBadgeText: rulesetConfig.showBlockedCount,
            });
        }
        saveRulesetConfig().then(( ) => {
            callback();
            broadcastMessage({ showBlockedCount: rulesetConfig.showBlockedCount });
        });
        return true;

    case 'setStrictBlockMode':
        setStrictBlockMode(request.state).then(( ) => {
            callback();
            broadcastMessage({ strictBlockMode: rulesetConfig.strictBlockMode });
        });
        return true;

    case 'setDeveloperMode':
        rulesetConfig.developerMode = request.state;
        toggleDeveloperMode(rulesetConfig.developerMode);
        saveRulesetConfig().then(( ) => {
            callback();
        });
        return true;

    case 'popupPanelData': {
        Promise.all([
            getFilteringMode(request.hostname),
            hasOmnipotence(),
            hasGreatPowers(request.origin),
            getEnabledRulesetsDetails(),
            adminReadEx('disabledFeatures'),
        ]).then(results => {
            callback({
                level: results[0],
                autoReload: rulesetConfig.autoReload,
                hasOmnipotence: results[1],
                hasGreatPowers: results[2],
                rulesetDetails: results[3],
                isSideloaded,
                developerMode: rulesetConfig.developerMode,
                disabledFeatures: results[4],
            });
        });
        return true;
    }

    case 'getFilteringMode': {
        getFilteringMode(request.hostname).then(actualLevel => {
            callback(actualLevel);
        });
        return true;
    }

    case 'gotoURL':
        gotoURL(request.url, request.type);
        break;

    case 'setFilteringMode': {
        getFilteringMode(request.hostname).then(actualLevel => {
            if ( request.level === actualLevel ) { return actualLevel; }
            return setFilteringMode(request.hostname, request.level);
        }).then(actualLevel => {
            registerInjectables();
            callback(actualLevel);
        });
        return true;
    }

    case 'getDefaultFilteringMode': {
        getDefaultFilteringMode().then(level => {
            callback(level);
        });
        return true;
    }

    case 'setDefaultFilteringMode': {
        getDefaultFilteringMode().then(beforeLevel =>
            setDefaultFilteringMode(request.level).then(async afterLevel => {
                const rulesetsForMode = getRulesetsForMode(afterLevel); // определите эту функцию
                await enableRulesets(rulesetsForMode);
                await updateDynamicRules();
                return { beforeLevel, afterLevel };
            })
        ).then(({ beforeLevel, afterLevel }) => {
            if (afterLevel !== beforeLevel) {
                registerInjectables();
            }
            callback(afterLevel);
            if (rulesetConfig.autoReload) {
                chrome.tabs.query({}, tabs => {
                    for (const tab of tabs) {
                        if (tab.url && !tab.url.startsWith(chrome.runtime.getURL(''))) {
                            chrome.tabs.reload(tab.id);
                        }
                    }
                });
            }
        });
        return true;
    }

    case 'setTrustedSites':
        setTrustedSites(request.hostnames).then(( ) => {
            registerInjectables();
            return Promise.all([
                getDefaultFilteringMode(),
                getTrustedSites(),
            ]);
        }).then(results => {
            callback({
                defaultFilteringMode: results[0],
                trustedSites: Array.from(results[1]),
            });
        });
        return true;

    case 'excludeFromStrictBlock': {
        excludeFromStrictBlock(request.hostname, request.permanent).then(( ) => {
            callback();
        });
        return true;
    }

    case 'getMatchedRules':
        getMatchedRules(request.tabId).then(entries => {
            callback(entries);
        });
        return true;

    case 'showMatchedRules':
        windows.create({
            type: 'popup',
            url: `/matched-rules.html?tab=${request.tabId}`,
        });
        break;

    default:
        break;
    }

    return false;
}

/******************************************************************************/

export async function start() {
    await loadRulesetConfig();
    const currentMode = await getDefaultFilteringMode();
    const rulesetsForMode = getRulesetsForMode(currentMode);
    await enableRulesets(rulesetsForMode);

    const currentVersion = getCurrentVersion();
    const isNewVersion = currentVersion !== rulesetConfig.version;

    // The default rulesets may have changed, find out new ruleset to enable,
    // obsolete ruleset to remove.
    if ( isNewVersion ) {
        ubolLog(`Version change: ${rulesetConfig.version} => ${currentVersion}`);
        rulesetConfig.version = currentVersion;
        await patchDefaultRulesets();
        saveRulesetConfig();
    }

    const rulesetsUpdated = process.wakeupRun === false &&
        await enableRulesets(rulesetConfig.enabledRulesets);

    // We need to update the regex rules only when ruleset version changes.
    if ( rulesetsUpdated === false ) {
        if ( isNewVersion ) {
            updateDynamicRules();
        } else if ( process.wakeupRun === false ) {
            updateSessionRules();
        }
    }

    // Permissions may have been removed while the extension was disabled
    const permissionsChanged = await onPermissionsRemoved();

    // Unsure whether the browser remembers correctly registered css/scripts
    // after we quit the browser. For now uBOL will check unconditionally at
    // launch time whether content css/scripts are properly registered.
    if ( process.wakeupRun === false || permissionsChanged ) {
        registerInjectables();

        const enabledRulesets = await dnr.getEnabledRulesets();
        ubolLog(`Enabled rulesets: ${enabledRulesets}`);

        dnr.getAvailableStaticRuleCount().then(count => {
            ubolLog(`Available static rule count: ${count}`);
        });
    }

    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest
    //   Firefox API does not support `dnr.setExtensionActionOptions`
    if ( process.wakeupRun === false && canShowBlockedCount ) {
        dnr.setExtensionActionOptions({
            displayActionCountAsBadgeText: rulesetConfig.showBlockedCount,
        });
    }

    runtime.onMessage.addListener(onMessage);

    browser.permissions.onRemoved.addListener(
        ( ) => { onPermissionsRemoved(); }
    );

    if ( process.firstRun ) {
        const enableOptimal = await hasOmnipotence();
        if ( enableOptimal ) {
            const afterLevel = await setDefaultFilteringMode(MODE_OPTIMAL);
            if ( afterLevel === MODE_OPTIMAL ) {
                updateDynamicRules();
                registerInjectables();
                process.firstRun = false;
            }
        } else {
            const disableFirstRunPage = await adminRead('disableFirstRunPage');
            if ( disableFirstRunPage !== true ) {
                runtime.openOptionsPage();
            } else {
                process.firstRun = false;
            }
        }
    }

    toggleDeveloperMode(rulesetConfig.developerMode);

    // Required to ensure the up to date property is available when needed
    if ( process.wakeupRun === false ) {
        adminReadEx('disabledFeatures');
    }
}

// https://github.com/uBlockOrigin/uBOL-home/issues/199
// Force a restart of the extension once when an "internal error" occurs
start().then(( ) => {
    localRemove('goodStart');
    return false;
}).catch(reason => {
    console.trace(reason);
    if ( process.wakeupRun ) { return; }
    return localRead('goodStart').then(goodStart => {
        if ( goodStart === false ) {
            localRemove('goodStart');
            return false;
        }
        return localWrite('goodStart', false).then(( ) => true);
    });
}).then(restart => {
    if ( restart !== true ) { return; }
    runtime.reload();
});
