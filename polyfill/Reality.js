import EventHandlerBase from './fill/EventHandlerBase.js'
import MatrixMath from './fill/MatrixMath.js'

/*
A Reality represents a view of the world, be it the real world via sensors or a virtual world that is rendered with WebGL or WebGPU.
*/
export default class Reality extends EventHandlerBase {
	constructor(xr, name, isShared, isPassthrough){
		super()
		this._xr = xr
		this._name = name
		this._isShared = isShared
		this._isPassthrough = isPassthrough
		this._anchors = new Map()
		this._hitTestResults = new Map()
	}

	get name(){ return this._name }

	get isShared(){ return this._isShared }

	get isPassthrough(){ return this._isPassthrough }

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
	_requestTracker(type, options) {
		return null
	}

	/*
	Called when at least one active XRSession is using this Reality
	*/
	_start(){
		throw new Error('Exending classes should implement _start')
	}

	/*
	Called when no more active XRSessions are using this Reality
	*/
	_stop(){
		throw new Error('Exending classes should implement _stop')
	}

	/*
	Called before animation frame callbacks are fired in the app
	Anchors should be updated here
	*/
	_beforeAnimationFrame() {}

	/*
	Called after animation frame callbacks are fired in the app
	*/
	_afterAnimationFrame() {
		for (const hitTestResult of this._hitTestResults) {
			hitTestResult._transform = null
		}
		this._hitTestResults.clear()
	}

	/*
	Create an anchor hung in space
	*/
	_addAnchor(anchor){
		// returns DOMString anchor UID
		throw new Error('Exending classes should implement _addAnchor')
	}

	/**
	 * Request an asyncronous hit test (for the next frame) using normalized screen coordinates.
	 * Returns a promise that resolves to an array of XRHit objects, or null if the hit test failed.
	 * 
	 * Normalized screen x and y are in range 0..1, with 0,0 at top left and 1,1 at bottom right
	 * 
	 * @param {*} normalizedScreenX 
	 * @param {*} normalizedScreenY 
	 */
	_requestHitTest(normalizedScreenX, normalizedScreenY){
		throw new Error('Exending classes should implement _requestHitTest')
	}

	/**
	 * Perform an immediate (synchronous) hit test using normalized screen coordinates.
	 * Returns an array of XRHit objects, or null if the hit test failed.
	 * 
	 * Normalized screen x and y are in range 0..1, with 0,0 at top left and 1,1 at bottom right
	 * 
	 * @param {*} normalizedScreenX 
	 * @param {*} normalizedScreenY 
	 */
	_hitTest(normalizedScreenX, normalizedScreenY){
		// default polyfill implementation (can be overriden):
		// given screen coordinate C, starting at frame N
		// - an async hit test request is made using screen coordiantes C for frame N + 1
		//    -> frame N returns null (no hit test results)
		// - if this method is called again with the same parameters C for frame N+1
		//    -> the hit test result (which is now be available synchronously) is returned
		const key = normalizedScreenX + ',' + normalizedScreenY

		this._requestHitTest(normalizedScreenX,normalizedScreenX).then((results)=>{ // will resolve for next frame
			this._hitTestResults.set(key, results)
		})

		return this._hitTestResults.get(key)
	}

	_getAnchor(uid){
		return this._anchors.get(uid) || null
	}

	_removeAnchor(uid){
		// returns void
		throw new Error('Exending classes should implement _removeAnchor')
	}

	_getLightAmbientIntensity(){
		throw new Error('Exending classes should implement _getLightAmbientIntensity')
	}
	// attribute EventHandler onchange;
}
