import EventHandlerBase from './fill/EventHandlerBase.js'
import {XRAnchorOffset} from './XRFrame.js'

/*
A script that wishes to make use of an XRDevice can request an XRSession.
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

		this._didPrintHitTestDeprecationWarning = false
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

	get depthNear(){ return this._device.depthNear }
	set depthNear(value){ this._device.depthNear = value }

	get depthFar(){ return this._device.depthFar }
	set depthFar(value){ this._device.depthFar = value }

	requestAnimationFrame(callback) {
		if(this._ended) return null
		if(typeof callback !== 'function'){
			throw 'Invalid callback'
		}
        this._callbackId++;
        this._callbacks[this._callbackId] = callback;
        return this._callbackId;
	}

	// backwards compatability
	requestFrame(callback) {
		return this.requestAnimationFrame(callback)
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
		return Promise.resolve().then(() => {
			return this._device._getFrameOfReference(type, options)
		})
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
	 * Return a promise that resolves to a list of XRHit instances, 
	 * or null if the hit test fails. The UA will attempt to resolve this promise before the next animation frame
	 */
	requestHitTest(normalizedScreenX, normalizedScreenY) {
		return this._reality._requestHitTest(normalizedScreenX, normalizedScreenY)
	}

	/**
	 * @deprecated Use reqeustHitTest
	 */
	hitTest(normalizedScreenX, normalizedScreenY) {
		// Array<XRHit> hitTest(float32, float32);
		if (!this._didPrintHitTestDeprecationWarning) {
			console.warn('XRSession.hitTest() is deprecated, use XRSession.requestHitTest()')
			this._didPrintHitTestDeprecationWarning = true
		}
		return this.reality._requestHitTest(normalizedScreenX, normalizedScreenY).then((hits)=>{
			if (hits.length === 0) return null
			return new XRAnchorOffset(hits[0])
		})
	}

	/**
	 * Return a promise that resolves (at the next frame) to a new XRAnchor at the current device pose
	 */
	requestMidAirAnchor() {
		//DOMString? requestMidAirAnchor();
		return this._onNextFrame().then((frame)=>{
			return frame.createMidAirAnchor()
		})
	}

	requestAnchorFromHit(hit) {
		return this._onNextFrame().then((frame) => {
			return frame.createAnchorFromHit(hit)
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
		return new XRFrame(this)
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
