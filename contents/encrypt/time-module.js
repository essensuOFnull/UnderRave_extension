var timeModule = function(){

	if (!Date.now) {
    	Date.now = function() { return new Date().getTime(); };
	}

	this.timestamp = 0;
	this.seed = 0;

	this.unixtimeStamps = {};
	this.ids = {};

	this.generateUnixtime = function(){
		this.timestamp = Math.floor(Date.now() / 100);
		return this.timestamp;
	};

	this.generateSeed = function(){
		// 0x100000000
		this.seed = Math.floor(Math.random()*4294967296);
		return this.seed;
	};

	this.getLastUnixtime = function(){
		if (this.timestamp){
			return this.timestamp;
		}
		return this.generateUnixtime();
	};

	this.getLastSeed = function(){
		if(this.seed){
			return this.seed;
		}
		return this.generateSeed();
	};


	// Replay attack methods
	this.setLastUnixtime = function(sender,time,id,dialogId){

		if (!ids[sender]){
			ids[sender] = {};
			unixtimeStamps[sender] = {};
		}

		if (!ids[sender][dialogId]){
			ids[sender][dialogId] = id;
			unixtimeStamps[sender][dialogId] = time;
			return;
		}

		var currentId = ids[sender][dialogId];
		var currentTime = unixtimeStamps[sender][dialogId];

		if (Number(currentId) < Number(id)){
			ids[sender][dialogId] = id;
			if (Number(currentTime) < Number(time)){
				unixtimeStamps[sender][dialogId] = time;
			}
		}
	};

	this.checkLastUnixtime = function(sender,time,id,dialogId){

		if(ids[sender]
			&& ids[sender][dialogId]
			&& (Number(ids[sender][dialogId]) < Number(id))
			&& (Number(unixtimeStamps[sender][dialogId]) >= Number(time))){
			return false;
		}
		
		return true;
	};

	return this;
}();