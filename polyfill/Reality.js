import EventHandlerBase from './fill/EventHandlerBase.js'
import XRHitAnchor from './XRHitAnchor.js'

/*
A Reality represents a view of the world, be it the real world via sensors or a virtual world that is rendered with WebGL or WebGPU.
*/
export default class Reality extends EventHandlerBase {
	constructor(device, name, isShared, isPassthrough){
		super()
		this._device = device
		this._vrDisplay = device._vrDisplay
		this._xr = device._xr
		this._name = name
		this._isShared = isShared
		this._isPassthrough = isPassthrough
		this._anchors = new Map()
	}

	get name(){ return this._name }

	get isShared(){ return this._isShared }

	get isPassthrough(){ return this._isPassthrough }

	/*
	 * Request an XRTracker. Returns the requested XRTracker instance if successful. 
	 * Otherwise, returns a rejected promise. 
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
	 * 
	 * Options vary depending on the type.
	 * 
	 * For 'ARGON_vuforia', options are:
	 * - encryptedLicenseData (string, mandatory) - can be generated at https://docs.argonjs.io/start/vuforia-pgp-encryptor/  
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
	_afterAnimationFrame() {}

	_addAnchor(anchor) {
		throw new Error('Exending classes should implement _addAnchor')
	}

	_createMidAirAnchor(){
		const anchor = new XRAnchor
		anchor._transform = this._session._device._pose._transform
		this._addAnchor(anchor)
		return anchor
	}

	_createAnchorFromHit(hit) {
		const anchor = new XRHitAnchor(hit)
		this._addAnchor(anchor)
		return anchor
	}
	
	/*
	Find an XRAnchor that is at floor level below the eye-level or head-model frame
	*/
	_requestFloorAnchor(uid=null){
		// for now, just position 1 meter below eye-level model
		const transform = this._device._eyeLevelFrameOfReference._transform || this._device._headModelFrameOfReference._transform		
		const floorAnchor = new XRAnchor(uid)
		floorAnchor._transform = transform
		floorAnchor._transform[13] = transform[13] - 1 
		this._addAnchor(floorAnchor)
		return Promise.resolve(floorAnchor)
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
		throw new Error('Exending classes should implement _hitTest')
	}

	_getAnchor(uid){
		return this._anchors.get(''+uid) || null
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
