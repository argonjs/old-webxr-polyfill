import EventHandlerBase from '../fill/EventHandlerBase.js'
import * as glMatrix from "../fill/gl-matrix/common.js";
import * as mat4 from "../fill/gl-matrix/mat4.js";
import * as quat from "../fill/gl-matrix/quat.js";
import * as vec3 from "../fill/gl-matrix/vec3.js";
import MatrixMath from "../fill/MatrixMath.js";

const OPEN = 'ar.session.open';
const CLOSE = 'ar.session.close';
const ERROR = 'ar.session.error';

const CONTEXT_UPDATE = 'ar.context.update';

const FOCUS_STATE = 'ar.focus.state'
const VISIBILITY_STATE = 'ar.visibility.state'
const VIEWPORT_MODE = 'ar.view.viewportMode'

const ARGON_ROLE = {
	MANAGER:'RealityManager',
	REALITY:'RealityViewer',
	AUGMENTER:'RealityAugmenter'
}

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

		this._anchorTrackableIdMap = new Map()
		this._hitTestResultMap = new Map()

		this._messageHandlers = {
			[OPEN]: (info) => {
				this._info = info;
				this._version = info.version || [0];
				this._isConnected = true;
				console.log('ArgonWrapper ' + JSON.stringify(info))
			},
			[CLOSE]: () => {
				this._isConnected = false;
			},
			[ERROR]: (err) => {
				console.log('ArgonWrapper received error: ' + err.message);
			},

			[CONTEXT_UPDATE]: (state) => {
				this.frameState = state;

				// support legacy Argon browser 
				if (state.entities['ar.user'] && !state.entities['ar.device.user']) {
					state.entities['ar.device.user'] = state.entities['ar.user'];
				}
				if (state.entities['ar.stage'] && !state.entities['ar.device.stage']) {
					state.entities['ar.device.stage'] = state.entities['ar.stage'];
				}

				// update stage matrix relative to tracker origin
				const stageEntityState = state.entities['ar.device.stage']
				if (stageEntityState && stageEntityState.r === 'ar.device.origin') {
					this._matrixFromEntityState(this._entityMatrix, stageEntityState)
					MatrixMath.mat4_invert(this._stageInverseWorldMatrix, this._stageWorldMatrix)
				}

				this._performNextAnimationFrame()
			},

			[FOCUS_STATE]: (state) => {
				console.log('ArgonWrapper focus ' + JSON.stringify(state));
			},

			[VISIBILITY_STATE]: (state) => {
				console.log('ArgonWrapper visibility ' + JSON.stringify(state));
			},

			[VIEWPORT_MODE]: (mode) => {
				console.log('ArgonWrapper viewport mode ' + JSON.stringify(mode))
			}
		}

		this.vuforia = new VuforiaService(this)

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

	getEntityTransformRelativeToStage(id) {
		const entityState = this.frameState.entities[id]
		if (!entityState) return null
		const entityReferenceFrame = entityState.r

		if (entityReferenceFrame === 'ar.device.stage' || entityReferenceFrame === 'ar.stage') {
			return this._matrixFromEntityState(this._entityMatrix, entityState)
		} else if (entityReferenceFrame === 'ar.device.origin' || entityReferenceFrame === 'ar.origin') {
			const entityWorldMatrix = this._matrixFromEntityState(this._entityMatrix, entityState)
			return MatrixMath.mat4_multiply(this._entityMatrix, this._stageInverseWorldMatrix, entityWorldMatrix);
		}
		
		console.log('ArgonWrapper is unable to convert "' + id + '" frame to "stage" frame from frame: ' + entityReferenceFrame);
		return null
	}

	getEntityTransformRelativeToOrigin(id) {
		const entityState = this.frameState.entities[id]
		if (!entityState) return null
		const entityReferenceFrame = entityState.r

		if (entityReferenceFrame === 'ar.device.origin' || entityReferenceFrame === 'ar.origin') {
			return this._matrixFromEntityState(this._entityMatrix, entityState)
		} else if (entityReferenceFrame === 'ar.device.stage' || entityReferenceFrame === 'ar.stage') {
			const entityChildMatrix = this._matrixFromEntityState(this._entityMatrix, entityState)
			return MatrixMath.mat4_multiply(this._entityMatrix, this._stageWorldMatrix, entityChildMatrix)
		}
		
		console.log('ArgonWrapper is unable to convert "' + id + '" frame to "tracker" frame from frame: ' + entityReferenceFrame);
		return null
	}

	createMidAirAnchor(uid, transform) {
		return this._request('xr.createMidAirAnchor', {uid, transform}).then(({trackableId})=>{
			this._anchorTrackableIdMap.set(uid, trackableId);
		})
	}

	createAnchorFromHit(uid, hitId) {
		return this._request('xr.createAnchorFromHit', {uid, hitId}).then(({trackableId})=>{
			this._anchorTrackableIdMap.set(uid, trackableId);
		})
	}

	getAnchorTransformRelativeToStage(uid) {
		const trackableId = this._anchorTrackableIdMap.get(uid);
		return this._getEntityTransformRelativeToStage(trackableId)
	}

	getAnchorTransformRelativeToTracker(uid) {
		const trackableId = this._anchorTrackableIdMap.get(uid);
		return this._getEntityTransformRelativeToTracker(trackableId)
	}

	requestHitTest(x,y) {
		return this._request('xr.hitTest',{x,y}).catch((e)=>{
			console.log('ArgonWrapper is unable to perform hit test');
			return []
		}).then((result)=>{
			return result.hits
		})
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
		this._send(OPEN, {
			version: [1,5,0],
			role: ARGON_ROLE.AUGMENTER
		});
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