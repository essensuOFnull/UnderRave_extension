var storage = function(){

	var defaultKey = []; //default password

	this.setDefaultKey = function(key){
		defaultKey = key;
	}

	this.keys = {}; // index - dialogId, values - generated password

	this.originalDialogMessages = {}; // index - dialogId, values - array: key - message id, value - message object
	this.modifiedDialogMessages = {}; // index - dialogId, values - array: key - message id, value - message object
	this.dialogMessagesState = {}; // index - dialogId, values - array: key - message id, value - bool (decrypted = true)
	this.dialogNonVKEMessages = {}; // index - dialogId, values - array of message ids
	this.dialogMessagesColor = {};
	this.temporaryMessagesIds = [];


	this.exchangePublicKeys = {};
	this.exchangePrivateKeys = {};
	this.exchangeHandledIdentifiers = {};
	this.exchangeSecretKeys = {};

	this.currentInputMessages = {};

	this.addKey = function(key, path){
		keys[path] = key;
	};

	this.getKey = function(path){
		if (this.keys[path] != null){
			return this.keys[path];
		}
		return defaultKey;
	};

	this.storeOriginalMessage = function(id, dialogId, author, message){
		var messageObject = { author : author, message : message };
		if (!this.originalDialogMessages[dialogId]){
			this.originalDialogMessages[dialogId] = {};
		}

		this.originalDialogMessages[dialogId][id] = messageObject;
		this.setMessageState(id, dialogId, false);
	};

	this.getOriginalMessage = function(id, dialogId){
		if (this.originalDialogMessages[dialogId]){
			if (this.originalDialogMessages[dialogId][id]){
				return this.originalDialogMessages[dialogId][id];
			}
		}

		return null;
	};

	this.isCached = function(id, dialogId){
		if ((modifiedDialogMessages[dialogId] && modifiedDialogMessages[dialogId][id])
			|| (dialogNonVKEMessages[dialogId] && (dialogNonVKEMessages[dialogId].includes(id)))){
			return true;
		}

		return false;
	};

	this.storeModifiedMessage = function(id, dialogId, author, message){
		var messageObject = { author : author, message : message };
		if (!this.modifiedDialogMessages[dialogId]){
			this.modifiedDialogMessages[dialogId] = {};
		}

		this.modifiedDialogMessages[dialogId][id] = messageObject;
		this.setMessageState(id, dialogId, true);
	};

	this.getModifiedMessage = function(id, dialogId){
		if (this.modifiedDialogMessages[dialogId]){
			if (this.modifiedDialogMessages[dialogId][id]){
				return this.modifiedDialogMessages[dialogId][id];
			}
		}

		return null;
	};

	this.clearMessagesInfo = function(){
		this.originalDialogMessages = {};
		this.modifiedDialogMessages = {};
		this.dialogMessagesState = {};
		this.dialogNonVKEMessages = {};
		this.dialogMessagesColor = {};

		this.temporaryMessagesIds = [];
	};

	this.clearExchangeInfo = function(){
		this.exchangePublicKeys = {};
		this.exchangePrivateKeys = {};
		this.exchangeHandledIdentifiers = {};
		this.exchangeSecretKeys = {};
	};

	this.clearKeys = function(){
		this.keys = {};
	};

	this.clearAll = function(){
		clearMessagesInfo();
		clearExchangeInfo();
		clearKeys();
		this.currentInputMessages = {};
	};

	this.messageEncryptionState = function(id, dialogId){
		if (this.dialogMessagesState[dialogId]){
			return this.dialogMessagesState[dialogId][id];
		}

		return false;
	};

	this.setMessageState = function(id, dialogId, state){
		if (!this.dialogMessagesState[dialogId]){
			this.dialogMessagesState[dialogId] = {};
		}

		this.dialogMessagesState[dialogId][id] = state;
	};

	this.addNonVKEMessage = function(id, dialogId){
		if (!this.dialogNonVKEMessages[dialogId]){
			this.dialogNonVKEMessages[dialogId] = [];
		}

		this.dialogNonVKEMessages[dialogId].push(id);
	};

	this.isNonVKEMessage = function(id, dialogId){
		if (this.dialogNonVKEMessages[dialogId]){
			return dialogNonVKEMessages[dialogId].includes(id);
		}

		return false;
	};

	this.setMessagesColor = function(id, dialogId, color){
		if (!this.dialogMessagesColor[dialogId]){
			this.dialogMessagesColor[dialogId] = {};
		}

		this.dialogMessagesColor[dialogId][id] = color;
	};

	this.getMessagesColor = function(id, dialogId){
		if (this.dialogMessagesColor[dialogId]){
			var result = this.dialogMessagesColor[dialogId][id];
			if (result){
				return result;
			}
		}

		return "";
	};


	this.resetDialogMessagesState = function(dialogId){
		if (!this.dialogMessagesState[dialogId]){
			return;
		}

		for (var value in this.dialogMessagesState[dialogId]){
			setMessageState(value, dialogId, false);
		}
	};

	this.belongsToDialog = function(dialogId, id){
		if ((originalDialogMessages[dialogId] && originalDialogMessages[dialogId][id])
			|| (dialogNonVKEMessages[dialogId] && (dialogNonVKEMessages[dialogId].includes(id)))){
			return true;
		}

		return false;
	};

	this.storeExchangePrivateKey = function(key, identifier){
		this.exchangePrivateKeys[identifier] = key;
	};

	this.storeExchangePublicKey = function(key, identifier){
		this.exchangePublicKeys[identifier] = key;
	};

	this.getExchangePrivateKey = function(identifier){
		if (!this.exchangePrivateKeys[identifier]) return false;
		return this.exchangePrivateKeys[identifier];
	};

	this.getExchangePublicKey = function(identifier){
		if (!this.exchangePublicKeys[identifier]) return false;
		return this.exchangePublicKeys[identifier];
	};

	this.isExchangeRequestHandled = function(identifier){
		return this.exchangeHandledIdentifiers[identifier];
	}

	this.setExchangeRequestAsHandled = function(identifier){
		this.exchangeHandledIdentifiers[identifier] = true;
	}

	this.setExchangeSecretKey = function(identifier, key){
		this.exchangeSecretKeys[identifier] = key;
	}

	this.getExchangeSecretKey = function(identifier){
		if (!this.exchangeSecretKeys[identifier]) return false;
		return this.exchangeSecretKeys[identifier];
	}

	this.addTemporaryMessageId = function(id){
		this.temporaryMessagesIds.push(id);
	}

	this.setPermanentMessageId = function(dialogId, oldId, newId){
		if (!this.temporaryMessagesIds.includes(oldId)){
			return;
		}

		if (this.originalDialogMessages[dialogId]){
			var message = this.originalDialogMessages[dialogId][oldId];
			if (message){
				this.originalDialogMessages[dialogId][newId] = message;
				this.originalDialogMessages[dialogId][oldId] = null;
			}
		}

		if (this.modifiedDialogMessages[dialogId]){
			var message = this.modifiedDialogMessages[dialogId][oldId];
			if (message){
				this.modifiedDialogMessages[dialogId][newId] = message;
				this.modifiedDialogMessages[dialogId][oldId] = null;
			}
		}

		var color = this.getMessagesColor(oldId, dialogId);
		this.setMessagesColor(newId, dialogId, color);

		this.setMessageState(newId, dialogId, false);

		index = this.temporaryMessagesIds.indexOf(oldId);
		if (index != -1){
			this.temporaryMessagesIds.splice(index, 1);
		}
	}

	this.setCurrentMessage = function(dialogId, inputMessage){
		this.currentInputMessages[dialogId] = inputMessage;
	}

	this.getCurrentMessage = function(dialogId){
		if (!this.currentInputMessages[dialogId]){
			return "";
		}

		return this.currentInputMessages[dialogId];
	}

	return this;
}();