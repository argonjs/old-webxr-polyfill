import MatrixMath from './fill/MatrixMath.js'
import EventHandlerBase from './fill/EventHandlerBase.js'

import XRCoordinateSystem from './XRCoordinateSystem.js';
import XRFrameOfReference from './XRFrameOfReference.js';
import XRSession from './XRSession.js';

import CameraReality from './reality/CameraReality.js';
import VirtualReality from './reality/VirtualReality.js'


/*
Each XRDevice represents a method of using a specific type of hardware to render AR or VR realities and layers.

This doesn't yet support a geospatial coordinate system
*/
export default class XRDevice extends EventHandlerBase {
	constructor(xr, vrDisplay=null){
		super()
		this._xr = xr
		this._vrDisplay = vrDisplay
		this._isExternal = vrDisplay ? vrDisplay.capabilities.hasExternalDisplay : false
		this._displayName = vrDisplay? vrDisplay.displayName : ''
		
		this._cameraReality = new CameraReality(this) 
		
		this._reality = this._cameraReality // for immersive session only
		
		this._immersiveSession = null
		this._nonImmersiveSessions = []

		this._pose = new XRCoordinateSystem
		this._pose._transform = MatrixMath.mat4_generateIdentity()

		this._headModelFrameOfReference = new XRFrameOfReference
		this._eyeLevelFrameOfReference = new XRFrameOfReference
		this._stageFrameOfReference = new XRFrameOfReference

		this._animateBound = this._animate.bind(this)

		this._views = []

		this.depthNear = 0.01
		this.depthFar = 1000

		// used when running for backwards compatability
		this._forceImmersive = false
		this._keepDocumentBodyVisible = false
		this._onlyAR = false

		this.__IDENTITY_ORIENTATION = [0,0,0,1]
	}

	get isExternal(){ return this._isExternal }

	get depthNear(){ return this._depthNear }
	set depthNear(value){ 
		this._depthNear = value 
		if (this._vrDisplay) {
			this._vrDisplay.depthNear = value
		}
	}

	get depthFar(){ return this._depthFar }
	set depthFar(value){ 
		this._depthFar = value 
		if (this._vrDisplay) {
			this._vrDisplay.depthFar = value
		}
	}

	supportsSession(parameters){
		// parameters: XRSessionCreateParametersInit 
		// returns boolean
		if (this._forceImmersive) parameters.immersive = true
		if (parameters.exclusive) parameters.immersive = true
		return this._supportedCreationParameters(parameters)
	}

	requestSession(parameters){
		if (this._forceImmersive) parameters.immersive = true
		if (parameters.exclusive) parameters.immersive = true
		return Promise.resolve().then(() => {
			if (parameters.immersive && this._immersiveSession) {
				throw new Error('There can only be one immersive session per XRDevice instance')
			}
			
			if (this._supportedCreationParameters(parameters) === false){
				throw new Error('Unsupported session creation parameters')
			}

			return this._createSession(parameters)
		})
	}

	_getFrameOfReference(type, options) {
		let frame = null;
		switch(type) {
			case 'headModel':
			case XRFrameOfReference.HEAD_MODEL:
				frame = this._headModelFrameOfReference
				break;
			case 'eyeLevel':
			case XRFrameOfReference.EYE_LEVEL:				
				frame = this._eyeLevelFrameOfReference
				break;
			case XRFrameOfReference.STAGE:
				frame = this._stageFrameOfReference
				break;
			default:
				throw new Error(`Unknown XRFrameOfReference type: "${type}"`)
		}
		if (!frame) throw new Error(`XRFrameOfReference type "${type}" is unavailable`)
		return frame
	}

	_requestAnimationFrame(callback) {
		return window.requestAnimationFrame(callback)
	}

	_animate() {
		if (!this._immersiveSession && this._nonImmersiveSessions.length === 0) return
		this._requestAnimationFrame(this._animateBound)
		this._beforeAnimationFrame()
		
		this._headModelFrameOfReference._orientation = this._eyeLevelFrameOfReference._orientation || this.__IDENTITY_ORIENTATION
		this._headModelFrameOfReference._position = this._pose._position

		if (this._immersiveSession) {
			this._immersiveSession.reality._beforeAnimationFrame()
			this._immersiveSession._fireAnimationFrameCallbacks()
			this._immersiveSession.reality._afterAnimationFrame()
		} else {
			for (const session of this._nonImmersiveSessions) {
				session.reality._beforeAnimationFrame()
				session._fireAnimationFrameCallbacks()
				session.reality._afterAnimationFrame()
			}
		}
		this._afterAnimationFrame()
	}

	_createSession(parameters){
		const reality = parameters.type === XRSession.AUGMENTATION ? this._cameraReality : new VirtualReality(this)
		const session = new XRSession(this._xr, this, parameters, reality)
		
		if (parameters.immersive) {
			this._reality = reality
			this._immersiveSession = session
			session.addEventListener('end', () => {
				this._immersiveSession = null
				this._handleNewBaseLayer(null, parameters)
				reality._stop()
			})
			session.addEventListener('_baseLayerChanged', ()=>{
				this._handleNewBaseLayer(session.baseLayer, parameters)
			})
		} else {
			this._nonImmersiveSessions.push(session)
			session.addEventListener('end', () => {
				const idx = this._nonImmersiveSessions.indexOf(session)
				this._nonImmersiveSessions.splice(idx, 1)
				reality._stop()
			})
		}

		return Promise.resolve(reality._start()).then(() => {
			this._requestAnimationFrame(this._animateBound)
			return session
		})
	}

	_supportedCreationParameters(parameters){
		if (parameters.immersive && this._immersiveSession) return false

		if (parameters.type === XRSession.AUGMENTATION) {
			if (this._vrDisplay && !CameraReality.supportsVRDisplay(this._vrDisplay)) return false
			return true
		}

		if (this._onlyAR) return false

		return true
	}

	/*
	Called before animation frame callbacks are fired in the app
	The device pose and frames of reference should be updated here
	*/
	_beforeAnimationFrame(){}

	/*
	Called after animation frame callbacks are fired in the app
	Use this for any display submission calls that need to happen after the render has occurred.
	*/
	_afterAnimationFrame(){}


	/*
	Called by XRSession after the session.baseLayer is assigned a value
	*/
	_handleNewBaseLayer(baseLayer){}

	//attribute EventHandler ondeactivate;
}
