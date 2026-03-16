var keyexchangeModule = function(){
	var _rng = new SecureRandom();

	var moduleVersion = [0, 1];
	var allowedModuleVersions = [[0, 1]];

	// Package flags
	var initialKeyExchangeRequestFlag = 1;
	var keyExchangeRequestAnswerFlag = 2;

	// Version 0.4, module version 0.1:
	// Elliptic curve secp256r1 is used.
	// Elliptic curve params for for all versions in hex text

	var ellipticCurveParameters = {};
	ellipticCurveParameters[toInt32([0, 1])] = {
		P : "FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF",
		A : "FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC",
		B : "5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B",
		GX : "6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296",
		GY : "4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5",
		N : "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551"
	};

	var curve = {};

	var getResultObject = function(){
		return {
			value : {
				identifier : {},
				secondIdentifier : {},
				publicKey : {
					X : {},
					Y : {}
				},
				privateKey : {},
				storedPublicKey : {},
				package : []
			},
			result : false
		};
	};

	var getCurve = function(version){
		var versionNumber = toInt32(version);
		if (curve[versionNumber] == null){
			var params = ellipticCurveParameters[versionNumber];
			if (params == null){
				return false;
			}

			var p = new BigInteger(params.P, 16);
			var a = new BigInteger(params.A, 16);
			var b = new BigInteger(params.B, 16);
			var x = new BigInteger(params.GX, 16);
			var y = new BigInteger(params.GY, 16);
			var n = new BigInteger(params.N, 16);
			var resultCurve = new ECCurveFp(p, a, b);
			var generator = new ECPointFp(resultCurve, resultCurve.fromBigInteger(x), resultCurve.fromBigInteger(y));
			curve[versionNumber] = {
				curve : resultCurve,
				G : generator,
				N : n
			};
		}

		return curve[versionNumber];
	};

	this.generatePrivateKeyAndPublicValue = function(){
		var result = getResultObject();

		var curve = getCurve(moduleVersion);
		var n = curve.N;
		var g = curve.G;
		curve = curve.curve;

		// Generate random
		var randomNumber = new BigInteger(n.bitLength(), _rng);
		var private = randomNumber.mod(n.subtract(BigInteger.ONE)).add(BigInteger.ONE);
		var public = g.multiply(private);

		result.value.publicKey.X = public.getX().toBigInteger();
		result.value.publicKey.Y = public.getY().toBigInteger();
		result.value.privateKey = private;

		result.result = true;
		return result;
	};

	this.calculateSecretKey = function(publicKey, privateKey){
		if (publicKey == null || publicKey.X == null || publicKey.Y == null || privateKey == null) return false;
		var curve = getCurve(moduleVersion).curve;
		var publicPoint = new ECPointFp(curve, curve.fromBigInteger(publicKey.X), curve.fromBigInteger(publicKey.Y));
		var privateSecretKey = publicPoint.multiply(privateKey);

		return privateSecretKey;
	};

	this.populateInitialPackage = function(result){
		result.result = false;

		// Extension package
	    var contentTypeArray = [configuration.keyExchangeModuleKey];
	    var contentVersionArray = moduleVersion;

	    // Module package
		var flagArray = [initialKeyExchangeRequestFlag];
		var identifierArray = new Array();
		identifierArray.length = 4;
		_rng.nextBytes(identifierArray);
		var identifier = toInt32(identifierArray);


		// Store private key
		storePrivateKey(result.value.privateKey, identifier);

		// Convert from unnecessary Uint8Array to array for concatenation
		var publicXKeyArray = result.value.publicKey.X.toByteArray();
		var publicXLengthArray = [].slice.call(toBytesInt32(publicXKeyArray.length, 2));
		var publicYKeyArray = result.value.publicKey.Y.toByteArray();
		var publicYLengthArray = [].slice.call(toBytesInt32(publicYKeyArray.length, 2));

		var resultArr = new Uint8Array(
			contentTypeArray
			.concat(contentVersionArray)
			.concat(flagArray)
			.concat(identifierArray)
			.concat(publicXLengthArray)
			.concat(publicXKeyArray)
			.concat(publicYLengthArray)
			.concat(publicYKeyArray));

		result.value.identifier = identifier;
		result.result = true;
		result.value.package = resultArr;
	};

	this.populateAnswerPackage = function(result, inputResult){
		result.result = false;

		// Extension package
	    var contentTypeArray = [configuration.keyExchangeModuleKey];
	    var contentVersionArray = moduleVersion;

	    // Module package
		var flagArray = [keyExchangeRequestAnswerFlag];
		var identifierArray = new Array();
		identifierArray.length = 4;
		_rng.nextBytes(identifierArray);
		var identifier = toInt32(identifierArray);

		// Store private key
		storePrivateKey(result.value.privateKey, identifier);

		var publicXKeyArray = result.value.publicKey.X.toByteArray();
		var publicXLengthArray = [].slice.call(toBytesInt32(publicXKeyArray.length, 2));
		var publicYKeyArray = result.value.publicKey.Y.toByteArray();
		var publicYLengthArray = [].slice.call(toBytesInt32(publicYKeyArray.length, 2));

		// Extract inputResult identifier
		var requestIdentifierArray = [].slice.call(inputResult.value.package.slice(4,8));

		var secondIdentifier = toInt32(requestIdentifierArray);

		var resultArr = new Uint8Array(
			contentTypeArray
			.concat(contentVersionArray)
			.concat(flagArray)
			.concat(identifierArray)
			.concat(requestIdentifierArray)
			.concat(publicXLengthArray)
			.concat(publicXKeyArray)
			.concat(publicYLengthArray)
			.concat(publicYKeyArray));

		result.value.identifier = identifier;
		result.value.secondIdentifier = secondIdentifier;
		result.result = true;
		result.value.package = resultArr;
	};

	var getPrivateKey = function(identifier){
		return storage.getExchangePrivateKey(identifier);
	};

	var getPublicKey = function(identifier){
		return storage.getExchangePublicKey();
	};

	var storePrivateKey = function(key, identifier){
		return storage.storeExchangePrivateKey(key, identifier);
	};

	var storePublicKeyIfNotPresent = function(key, identifier){
		if (!storage.getExchangePublicKey()){
			storage.storeExchangePublicKey(key, identifier);
		}
	};

	this.parsePackage = function(packageArray){
		var result = getResultObject();
		result.value.package = packageArray;

		var contentType = packageArray[0];
		if (contentType != configuration.keyExchangeModuleKey){
			return result;
		}

		var contentVersion = toInt32(packageArray.slice(1,3));

		var messageFlag = packageArray.slice(3,4);
		var messageIdentifier = toInt32(packageArray.slice(4,8));
		if (messageFlag == keyExchangeRequestAnswerFlag){
			// This is an answer for requested key exchange, check storage for saved by response identifier
			// Populate private and/or public key if stored
			var requestIdentifier = toInt32(packageArray.slice(8,12));

			var publicKeyResult = getPublicKey(requestIdentifier);
			if (publicKeyResult){
				result.value.storedPublicKey = publicKeyResult;
			}

			// Our own request: check if our private key still exists
			var privateKeyResult = getPrivateKey(requestIdentifier);
			if (privateKeyResult){
				result.value.privateKey = privateKeyResult;
			}

			packageArray = packageArray.slice(12);

			result.value.secondIdentifier = requestIdentifier;
		}
		else{
			// Initial message, no info can be available
			packageArray = packageArray.slice(8);
		}

		// Extract public value
		var publicXKeyArrayLength = toInt32(packageArray.slice(0,2));
		var publicXKeyArray = packageArray.slice(2, 2 + publicXKeyArrayLength);
		packageArray = packageArray.slice(2 + publicXKeyArrayLength);

		var publicYKeyArrayLength = toInt32(packageArray.slice(0,2));
		var publicYKeyArray = packageArray.slice(2, 2 + publicYKeyArrayLength);

		// Create BigIntegers from byte arrays
		var x = new BigInteger(publicXKeyArray);
		var y = new BigInteger(publicYKeyArray);

		// Store any avaliable public key
		storePublicKeyIfNotPresent({ X : x, Y : y }, messageIdentifier);

		result.value.publicKey.X = x;
		result.value.publicKey.Y = y;
		result.value.identifier = messageIdentifier;

		result.result = true;
		return result;
	};

	return this;
}();