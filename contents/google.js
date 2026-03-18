(function(){
	/*Перехватывает клики на изображениях без id и открывает их src в новой вкладке.*/
	document.addEventListener(
		'click',
		(e) => {
			const img = e.target.closest('img');
			if (img && !img.id) {
			const src = img.src;
			// Игнорируем пустые и data:image
			if (src && src.startsWith('http')) {
				e.preventDefault();
				e.stopPropagation();
				window.open(src, '_blank');
			}
			}
		},
		true // Фаза перехвата (важно для блокировки обработчиков Google)
	);
})();