import MatrixMath from './fill/MatrixMath.js'
import EventHandlerBase from './fill/EventHandlerBase.js'

import XRFieldOfView from './XRFieldOfView.js'
import XRCoordinateSystem from './XRCoordinateSystem.js';
import XRFrameOfReference from './XRFrameOfReference.js';
import XRDevicePose from './XRDevicePose.js'
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

		this._cameraReality = new CameraReality(this._xr, this) // for exclusive/augmentation session only
		
		this._exclusiveSession = null
		this._nonExclusiveSessions = []

		this._pose = new XRCoordinateSystem
		this._pose._transform = MatrixMath.mat4_generateIdentity()

		this._headModelFrameOfReference = new XRFrameOfReference
		this._eyeLevelFrameOfReference = new XRFrameOfReference
		this._stageFrameOfReference = new XRFrameOfReference

		this._animateBound = this._animate.bind(this)

		this._views = []
	}

	get isExternal(){ return this._isExternal }

	supportsSession(parameters){
		// parameters: XRSessionCreateParametersInit 
		// returns boolean
		return this._supportedCreationParameters(parameters)
	}

	requestSession(parameters){
		return Promise.resolve().then(() => {
			if (parameters.exclusive && this._exclusiveSession) {
				throw new Error('There can only be one exclusive session per XRDevice instance')
			}
			
			if (this._supportedCreationParameters(parameters) === false){
				throw new Error('Unsupported session creation parameters')
			}

			return this._createSession(parameters)
		})
	}

	_requestFrameOfReference(type, options) {
		return Promise.resolve().then(() => {
			let frame = null;
			switch(type) {
				case XRFrameOfReference.HEAD_MODEL:
					frame = this._headModelFrameOfReference
					break;
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
		})
	}

	_requestAnimationFrame(callback) {
		return window.requestAnimationFrame(callback)
	}

	_animate() {
		if (!this._exclusiveSession && this._nonExclusiveSessions.length === 0) return
		this._requestAnimationFrame(this._animateBound)
		this._beforeAnimationFrame()
		this._headModelFrameOfReference._position = this._pose._position
		if (this._exclusiveSession) {
			this._exclusiveSession.reality._beforeAnimationFrame()
			this._exclusiveSession._fireAnimationFrameCallbacks()
			this._exclusiveSession.reality._afterAnimationFrame()
		} else {
			for (const session of this._nonExclusiveSessions) {
				session.reality._beforeAnimationFrame()
				session._fireAnimationFrameCallbacks()
				session.reality._afterAnimationFrame()
			}
		}
		this._afterAnimationFrame()
	}

	_createSession(parameters){
		const reality = parameters.type === XRSession.AUGMENTATION ? this._cameraReality : new VirtualReality(this._xr)
		const session = new XRSession(this._xr, this, parameters, reality)
		
		if (parameters.exclusive) {
			this._exclusiveSession = session
			session.addEventListener('end', () => {
				this._exclusiveSession = null
				this._handleNewBaseLayer(null)
				reality._stop()
			})
			session.addEventListener('_baseLayerChanged', ()=>{
				this._handleNewBaseLayer(session.baseLayer)
			})
		} else {
			this._nonExclusiveSessions.push(session)
			session.addEventListener('end', () => {
				const idx = this._nonExclusiveSessions.indexOf(session)
				this._nonExclusiveSessions.splice(idx, 1)
				reality._stop()
			})
		}

		return Promise.resolve(reality._start()).then(() => {
			this._requestAnimationFrame(this._animateBound)
			return session
		})
	}

	_supportedCreationParameters(parameters){
		if (!parameters.exclusive) return false // TODO: remove this line once outputContext is implemented

		if (parameters.exclusive && this._exclusiveSession) return false

		if (parameters.type === XRSession.AUGMENTATION) {
			if (this._vrDisplay && !CameraReality.supportsVRDisplay(this._vrDisplay)) return false
			if (!parameters.exclusive) return false // augmentation session must be exclusive
			return true
		}

		// else, assume type is REALITY (the default)
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
