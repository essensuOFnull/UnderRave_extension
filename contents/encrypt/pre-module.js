var premodule = function(){
	var _sha256 = sha256;

	this.prepare = function(array){
		var messageLength = toBytesInt32(array.length, 4);
		var hash = _sha256.array(array);

		var length = messageLength.length + hash.length + array.length;
		if (length % 16 != 0){
			length += 16 - length % 16;
		}

		var result = new Uint8Array(length);
		result.set(messageLength);
		result.set(hash, messageLength.length);
		result.set(array, messageLength.length + hash.length);

		return result;
	};

	this.check = function(array){
		var length = toInt32(array.slice(0,4));
		var message = array.slice(36, 36 + length);

		var calculatedhash = _sha256.array(message);
		var hash = array.slice(4,36);

		if (arrayEquality(calculatedhash, hash)){
			return message;
		}
		else{
			return false;
		}
	}

	return this;
}();
