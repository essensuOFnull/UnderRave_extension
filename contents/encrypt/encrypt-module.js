var encryptModule = function(){
	var _scrypt = scrypt;
	var _aesjs = aesjs;
	var _sha256 = sha256;

	var getResultObject = function(){
		return {
			result : false,
			decrypted : [],
			encrypted : []
		};
	};

    var salt = new TextEncoder().encode("");

	this.generateKey = function(key,path){
		var N = 1024, r = 8, p = 1;
	    var dkLen = 32;

	    _scrypt(key, salt, N, r, p, dkLen, function(error, progress, key) {
	        if (error){

	        } else 
	        	if (key) {
		        	if (path){
		            	storage.addKey(key,path)
		        	}
		        	else{
		        		storage.setDefaultKey(key);
		        	}
		        	if(navigationModule.key != "") initializeDialogHistory();
	            }
	    });
	};


	// DEFAULT KEY
	var passwordEncoded = new TextEncoder().encode("");
    generateKey(passwordEncoded);
    
	var IV = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

	this.prepareForEncryption = function(){
		switch(configuration.version){
			case "0.1":
				var timestamp = timeModule.generateUnixtime();
		    	var array = _sha256.array("" + timestamp).slice(0,16);
		    	var result = this.setIV(array);
				break;
			case "0.2":
				var timestamp = timeModule.generateUnixtime();
				var seed = timeModule.generateSeed();
		    	var array = _sha256.array("" + timestamp + seed).slice(0,16);
		    	var result = this.setIV(array);
				break;
			case "0.3":
			case "0.4":
				var timestamp = timeModule.generateUnixtime();
				var seed = timeModule.generateSeed();
		    	var array = _sha256.array("" + timestamp + seed + navigationModule.author).slice(0,16);
		    	var result = this.setIV(array);
				break;
		}
	};

	this.prepareForDecryption = function(header, author){
		switch(header.version){
			case "0.1":
	            var array = _sha256.array(header.date).slice(0,16);
	            this.setIV(array);
				break;
			case "0.2":
				var array = _sha256.array(header.date + header.seed).slice(0,16);
	            this.setIV(array);
				break;
			case "0.3":
			case "0.4":
				var array = _sha256.array(header.date + header.seed + author).slice(0,16);
	            this.setIV(array);
				break;
		}
	};

	this.setIV = function(iv){
		if (iv.length != 16){
			return false;
		}

		IV = iv;
		return true;
	};

	this.encrypt = function(message,key){

		var result = getResultObject();
		result.decrypted = message;

		try{
			var aesCbc = new _aesjs.ModeOfOperation.cbc(key, IV);
			var encryptedBytes = aesCbc.encrypt(message);

			result.encrypted = encryptedBytes;
			result.result = true;
		}
		catch(e){
			//console.log(e);
		}

		return result;
	};

	this.decrypt = function(message, key){

		var result = getResultObject();

		result.encryptedBytes = message;

		try{
			var aesCbc = new _aesjs.ModeOfOperation.cbc(key, IV);
			var decryptedBytes = aesCbc.decrypt(message);

			result.decrypted = decryptedBytes;
			result.result = true;
		}
		catch(e){
			//console.log(e);
		}

		return result;
	};

	return this;
}();