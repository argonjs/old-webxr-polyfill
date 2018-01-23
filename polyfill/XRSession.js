import EventHandlerBase from './fill/EventHandlerBase.js'

/*
A script that wishes to make use of an XRDevice can request an XRSession.
An XRSession provides a list of the available Reality instances that the script may request as well as make a request for an animation frame.
*/
export default class XRSession extends EventHandlerBase {
	constructor(xr, device, createParameters, reality){
		super(xr)
		this._xr = xr
		this._device = device
		this._createParameters = createParameters
		this._reality = reality
		this._ended = false

		this._baseLayer = null

		this._callbackId = 0
		this._callbacks = {}
		this._nextFramePromise = null
		this._nextFrameResolve = null
	}

	get device(){ return this._device }

	get createParameters(){ return this._parameters }

	get realities(){ return this._xr._sharedRealities }

	get reality(){ return this._reality }

	get baseLayer(){
		return this._baseLayer
	}

	set baseLayer(value){
		this._baseLayer = value
		this.dispatchEvent(new CustomEvent('_baseLayerChanged'))
	}

	get depthNear(){ this._device._depthNear }
	set depthNear(value){ this._device._depthNear = value }

	get depthFar(){ this._device._depthFar }
	set depthFar(value){ this._device._depthFar = value }

	requestAnimationFrame(callback) {
		if(this._ended) return null
		if(typeof callback !== 'function'){
			throw 'Invalid callback'
		}
        this._callbackId++;
        this._callbacks[this._callbackId] = callback;
        return this._callbackId;
	}

	cancelAnimationFrame(id) {
        delete this._callbacks[id];
	}

	// called by XRDevice
	_fireAnimationFrameCallbacks() {
		const frame = this._createPresentationFrame()
		if (this._nextFrameResolve) this._nextFrameResolve(frame)
		const callbacks = this._callbacks
		this._callbacks = {}
        for (let i in callbacks) {
            callbacks[i](frame)
		}
	}

	/**
	 * Request a frame of reference
	 * 
	 * @param {*} type 
	 * @param {*} options 
	 */
	requestFrameOfReference(type, options) {
		return this._device._requestFrameOfReference(type, options)
	}

	/*
	 * Request an XRTracker, or reject if the requested tracker is not available
	 * 
	 * Currently, the only tracker type is: 
	 * 'ARGON_vuforia' // only available in Argon browser
	 * 
	 * Potential future tracker types might include: 
	 * 'image'
	 * 'qrcode'
	 * 'text'
	 * 'object'
	 * 'face'
	 * 'body'
	 */
	requestTracker(type, options) {
		return this.reality._requestTracker(type, options)
	}

	/**
	 * Return a promise that resolves (at the next frame) to a list of XRHitTestResult instances, 
	 * or null if the hit test fails
	 * 
	 * This is the recommended approach for performing one-off hit tests in response to user input
	 */
	requestHitTest(normalizedScreenX, normalizedScreenY) {
		return this._reality._requestHitTest(normalizedScreenX, normalizedScreenY)
	}

	/**
	 * Return a promise that resolves (at the next frame) to a new mid-air anchor at the current device pose
	 */
	requestMidAirAnchor(){
		//DOMString? requestMidAirAnchor();
		return this._onNextFrame().then((frame)=>{
			return frame.createMidAirAnchor()
		})
	}

	end(){
		if (this._ended) return
		this._ended = true
		return Promise.resolve().then(() => {
			this.dispatchEvent(new CustomEvent('end'))
		})
	}

	_createPresentationFrame(){
		return new XRPresentationFrame(this)
	}

	_onNextFrame() {
		if (!this._nextFramePromise) {
			this._nextFramePromise = new Promise(resolve => {
				this._nextFrameResolve = (frame) => {
					this._nextFramePromise = null
					this._nextFrameResolve = null
					resolve(frame)
				}
			})
		}
		return this._nextFramePromise
	}

	/*
	attribute EventHandler onblur;
	attribute EventHandler onfocus;
	attribute EventHandler onresetpose;
	attribute EventHandler onend;
	*/
}

XRSession.REALITY = 'reality'
XRSession.AUGMENTATION = 'augmentation'

XRSession.TYPES = [XRSession.REALITY, XRSession.AUGMENTATION]
