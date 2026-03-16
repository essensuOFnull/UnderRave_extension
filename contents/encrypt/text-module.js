var textModule = function(){
	var moduleVersion = [0, 1];
	var allowedModuleVersions = [[0, 0], [0, 1]];

	var getResultObject = function(){
		return {
			result : false,
			value : []
		};
	};

	this.createText = function(text){
		var result = getResultObject();
		var messageArray = new TextEncoder().encode(text);
		
	    var contentTypeArray = [configuration.textModuleKey];
	    var contentVersionArray = moduleVersion;

		result.value = new Uint8Array(contentTypeArray.length + contentVersionArray.length + messageArray.length);
		result.value.set(contentTypeArray);
		result.value.set(contentVersionArray, contentTypeArray.length);
		result.value.set(messageArray, contentTypeArray.length + contentVersionArray.length);
		
	    result.result = true;
	    return result;
	};

	this.extractText = function(content){
		var result = getResultObject();
		var contentType = content[0];
		if (contentType != configuration.textModuleKey){
			return result;
		}

		var contentVersion = toInt32(content.slice(1,3));
		switch(contentVersion){
			case 1:
				var contentMessage = content.slice(3, content.length);
				var message = new TextDecoder("utf-8").decode(contentMessage);
				result.value = message;
				result.result = true;
				return result;
			default:
				return result;
		}
	};

	return this;
}();