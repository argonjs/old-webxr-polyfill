import EventHandlerBase from '../fill/EventHandlerBase.js'
import MatrixMath from "../fill/MatrixMath.js";

export default class ArgonWrapper extends EventHandlerBase {
	
	static HasArgon() {
		return  typeof window.webkit !== 'undefined' && 
				typeof window.webkit.messageHandlers.argon !== 'undefined' 
	}

	static GetOrCreate() {
		if (!ArgonWrapper.GLOBAL_INSTANCE) 
			ArgonWrapper.GLOBAL_INSTANCE = new ArgonWrapper;
		return ArgonWrapper.GLOBAL_INSTANCE;
	}

	constructor() {
		super();

		if(ArgonWrapper.HasArgon() === false){
			throw 'ArgonWrapper will only work in the Argon Browser'
		}
		if(typeof ArgonWrapper.GLOBAL_INSTANCE !== 'undefined'){
			throw 'ArgonWrapper is a singleton. Use ArgonWrapper.GetOrCreate() to get the global instance.'
		}

		this._packet =[];

		// requestAnimationFrame callbacks
		this._callbackId = 0;
		this._callbacks = {};

		this._stageWorldMatrix = MatrixMath.mat4_fromRotationTranslation(
			new Float32Array(16), 
			[0,0,0,1],
			[0,-XRDevicePose.SITTING_EYE_HEIGHT,0]
		)
		this._stageInverseWorldMatrix = MatrixMath.mat4_invert(new Float32Array(16), this._stageWorldMatrix)

		this._entityMatrix = new Float32Array(16)
		this._entityOrientation = []
		this._entityPosition = []

		this._anchorTrackableIdMap = new Map
		this._pendingHitTests = {}

		this._frameTimesCPU = []

		this.whenConnected = new Promise((resolve) => {

			this._messageHandlers = {
	
				'xr.frame': (state) => {
					const startTime = performance.now()
					this.frameState = state;

					const pendingHitTests = this._pendingHitTests
					this._pendingHitTests = {}

					const hitResults = []
					for (const id in pendingHitTests) {
						const pendingTest = pendingHitTests[id]
						const hitTestResult = state.hitTestResults[id] || []
						pendingTest.resolve(hitTestResult)
						hitResults.push(pendingTest.promise)
					}

					Promise.all(hitResults).then(()=>{

						if (state !== this.frameState) {
							console.log('skipped frame!')
						}

						this._performNextAnimationFrame()
						const endTime = performance.now()
						this._frameTimesCPU.push(endTime - startTime)
	
						if (this._frameTimesCPU.length === 60) {
							let totalCPUTime = 0
							for (const time of this._frameTimesCPU) {
								totalCPUTime += time
							}
							this._frameTimesCPU.length = 0
							const averageCPUTime = totalCPUTime / 60
							this._send('xr.averageCPUTime', {time: averageCPUTime})
						}
					})
				},
	
				// [FOCUS_STATE]: (state) => {
				// 	console.log('ArgonWrapper focus ' + JSON.stringify(state));
				// },
	
				// [VISIBILITY_STATE]: (state) => {
				// 	console.log('ArgonWrapper visibility ' + JSON.stringify(state));
				// },
	
				// [VIEWPORT_MODE]: (mode) => {
				// 	console.log('ArgonWrapper viewport mode ' + JSON.stringify(mode))
				// },
	
				// 'ar.device.state': () => {
	
				// }
			}


		})

		this._init();
	}

	_setOrientationPositionValuesFromEntityState(entityState) {
		const orientation = this._entityOrientation;
		const position = this._entityPosition;
		orientation[0] = entityState.o.x;
		orientation[1] = entityState.o.y;
		orientation[2] = entityState.o.z;
		orientation[3] = entityState.o.w;
		position[0] = entityState.p.x;
		position[1] = entityState.p.y;
		position[2] = entityState.p.z;
	}

	_matrixFromEntityState(matrix, entityState) {
		this._setOrientationPositionValuesFromEntityState(entityState)
		return MatrixMath.mat4_fromRotationTranslation(matrix, this._entityOrientation, this._entityPosition)
	}

	getEntityTransform(id) {
		if (!this.frameState) return null
		const entityState = this.frameState.trackableResults[id]
		if (!entityState) return null
		if (!entityState.pose) return null
		this._entityMatrix.set(entityState.pose)
		return this._entityMatrix
	}

	createMidAirAnchor(uid, pose) {
		return this._request('xr.createMidAirAnchor', {pose}).then(({id})=>{
			this._anchorTrackableIdMap.set(uid, id)
		})
	}

	createAnchorFromHit(uid, id) {
		return this._request('xr.createMidAirAnchor', {id, pose})
		// return this._request('xr.createHitAnchor', {id}).then(({id})=>{
		// 	this._anchorTrackableIdMap.set(uid, id)
		// })
	}

	getAnchorTransform(anchorName) {
		const id = this._anchorTrackableIdMap.get(anchorName) || anchorName;
		return this.getEntityTransform(id)
	}

	requestHitTest(x,y) {
		const id = `[${x},${y}]`
		let pendingTest = this._pendingHitTests[id]

		if (pendingTest) return pendingTest.promise

		pendingTest = this._pendingHitTests[id] = {}

		pendingTest.promise = new Promise((resolve) => {
			this._send('xr.hitTest',{id, point:{x, y}})
			pendingTest.resolve = resolve
		})

		return pendingTest.promise
	}

	setImmersiveMode(mode) {
		return this._request('xr.setImmersiveMode', {mode})
	}

	_init() {
		// handle incoming messages and allow a promise to be returned as a result
		window['__ARGON_PORT__'] = {
			postMessage: (messageData) => {
				if (this._isClosed) return;

				const data = typeof messageData === 'string' ? JSON.parse(messageData) : messageData;
				
				const id = data[0];
				const topic = data[1];
				const message = data[2] || {};
				const expectsResponse = data[3];
				const handler = this._messageHandlers[topic];

				if (handler && !expectsResponse) {
					handler(message)
				} else if (handler) {
					const response = new Promise((resolve) => resolve(handler(message)));
					Promise.resolve(response).then(response => {
						if (this._isClosed) return;
						this._send(topic + ':resolve:' + id, response)
					}).catch(error => {
						if (this._isClosed) return;
						let errorMessage
						if (typeof error === 'string') errorMessage = error;
						else if (typeof error.message === 'string') errorMessage = error.message;
						this._send(topic + ':reject:' + id, { reason: errorMessage })
					})
				} else {
					let errorMessage = 'ArgonWrapper is unable to handle message for topic ' + topic;
					console.log(errorMessage);
					if (expectsResponse) {
						this._send(topic + ':reject:' + id, { reason: errorMessage });
					}
				}
			}
		}

		// start connection
		// this._send(OPEN, {
		// 	version: [1,5,0],
		// 	role: ARGON_ROLE.AUGMENTER
		// });
		this._send('xr.start')
	}

	_send(topic, message) {
		this._sendPacket(createGuid(), topic, message, false)
	}

	_request(topic, message) {
        const id = createGuid();
        const resolveTopic = topic + ':resolve:' + id;
        const rejectTopic = topic + ':reject:' + id;
        const result = new Promise((resolve, reject) => {
            this._messageHandlers[resolveTopic] = (message) => {
                delete this._messageHandlers[resolveTopic];
                delete this._messageHandlers[rejectTopic];
                resolve(message);
            }
            this._messageHandlers[rejectTopic] = (message) => {
                delete this._messageHandlers[resolveTopic];
                delete this._messageHandlers[rejectTopic];
                console.warn("Request '" + topic + "' rejected with reason:\n" + message.reason);
                reject(new Error(message.reason));
            }
        })
		this._sendPacket(id, topic, message, true)
        return result;
	}

	_sendPacket(id, topic, message, expectsResponse) {
        const packet = this._packet;
		packet[0] = id
		packet[1] = topic
		packet[2] = message
		packet[3] = expectsResponse
		if (window['__argon_android__']) {
			window['__argon_android__'].emit("argon", JSON.stringify(packet));
		} else if (webkit.messageHandlers.argon) {
			webkit.messageHandlers.argon.postMessage(JSON.stringify(packet));
		}
	}
	
	requestAnimationFrame(cb) {
        this._callbackId++;
        this._callbacks[this._callbackId] = cb;
        return this._callbackId;
	}

	cancelAnimationFrame(id) {
        delete this._callbacks[id];
	}
	
	
	_performNextAnimationFrame() {
		const callbacks = this._callbacks;
		this._callbacks = {}
        for (let i in callbacks) {
            callbacks[i]();
        }
	}
}


const lut = []; for (var i=0; i<256; i++) { lut[i] = (i<16?'0':'')+(i).toString(16); }
function createGuid() {
  var d0 = Math.random()*0xffffffff|0;
  var d1 = Math.random()*0xffffffff|0;
  var d2 = Math.random()*0xffffffff|0;
  var d3 = Math.random()*0xffffffff|0;
  return lut[d0&0xff]+lut[d0>>8&0xff]+lut[d0>>16&0xff]+lut[d0>>24&0xff]+'-'+
    lut[d1&0xff]+lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
    lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]+lut[d2>>24&0xff]+
    lut[d3&0xff]+lut[d3>>8&0xff]+lut[d3>>16&0xff]+lut[d3>>24&0xff];
}