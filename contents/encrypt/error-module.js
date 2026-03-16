var errorModule = function(){

	this.wrongPassword = function(){
		return "Wrong password, impossible to decrypt"
	};

	this.wrongHeader = function(){
		return "Message has wrong header";
	};

	this.corruptedMessage = function(){
		return "Message was damaged";
	};

	this.decryptionError = function(){
		return "Decryption error: message might be damaged or internal error occured";
	};

	this.timestampWarninig = function(){
		return "Message is either first or fabricated";
	}

	return this;
}();