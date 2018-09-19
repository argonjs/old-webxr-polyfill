import XRDevice from '../XRDevice.js'
import XRDevicePose from '../XRDevicePose.js'
import XRView from '../XRView.js'
import XRSession from '../XRSession.js'
import XRFieldOfView from '../XRFieldOfView.js'

import MatrixMath from '../fill/MatrixMath.js'
import Quaternion from '../fill/Quaternion.js'
import Vector3 from '../fill/Vector3.js'

import DeviceOrientationTracker from '../fill/DeviceOrientationTracker.js'
import ARKitWrapper from '../platform/ARKitWrapper.js'
import ArgonWrapper from '../platform/ArgonWrapper.js'

/*
FlatDevice takes over a handset's full screen and presents a moving view into a Reality, as if it were a magic window.

If ARKit is present, it uses the ARKit updates to set the device pose.
If ARCore is available on the VRDisplays, use that to set the device pose.
If Argon is avialable, use that to set the device pose
Otherwise, use orientation events.
*/
export default class FlatDevice extends XRDevice {

	static _requestDevice(xr, vrDisplay) {
		// TODO: reject on devices without device orientation or any other tracking api ?
		// vrDisplay can be null if none is available
		return Promise.resolve(new FlatDevice(xr, vrDisplay))
	}

	constructor(xr, vrDisplay){
		super(xr, vrDisplay)

		this._started = false
		this._initialized = false

		// This is used if we have ARKit support
		this._arKitWrapper = null

		// This is used if we have Argon support
		this._argonWrapper = null

		// This is used if we have ARCore support
		this._vrFrameData = null

		// This is used if we are using orientation events
		this._deviceOrientationTracker = null

		// These are used if we have ARCore support or use window orientation events
		this._deviceOrientation = null			// Quaternion
		this._devicePosition = null				// Vector3
		this._deviceWorldMatrix = null			// Float32Array(16)

		// Use a full screen view as default
		const fov = 50/2;
		const fovs = new XRFieldOfView(fov, fov, fov, fov)
		const projectionMatrix = MatrixMath.mat4_perspectiveFromFieldOfView(new Float32Array(16), fovs, this.depthNear, this.depthFar)
		this._views.push(new XRView(projectionMatrix))

		this.__workingMatrix = new Float32Array(16)
		this.__IDENTITY = MatrixMath.mat4_generateIdentity()

		this._onWindowResize = () => {
			if (this.baseLayer && this._arKitWrapper === null) {
				this.baseLayer.framebufferWidth = this.baseLayer.context.canvas.clientWidth;
				this.baseLayer.framebufferHeight = this.baseLayer.context.canvas.clientHeight;
			}
		}
	}

	_start(){
		if (this.running) return
		if(this._vrDisplay){ // Use ARCore
			if(this._vrFrameData === null){
				this._vrFrameData = new VRFrameData()
				this._deviceOrientation = new Quaternion()
				this._devicePosition = new Vector3()
				this._deviceWorldMatrix = new Float32Array(16)
			}
		} else if(ARKitWrapper.HasARKit()){ // Use ARKit
			if(this._initialized === false){
				this._initialized = true
				this._arKitWrapper = ARKitWrapper.GetOrCreate()
				this._arKitWrapper.addEventListener(ARKitWrapper.INIT_EVENT, this._handleARKitInit.bind(this))
				this._arKitWrapper.addEventListener(ARKitWrapper.WATCH_EVENT, this._handleARKitUpdate.bind(this))
				this._arKitWrapper.addEventListener(ARKitWrapper.WINDOW_RESIZE_EVENT, this._handleARKitWindowResize.bind(this))
				this._arKitWrapper.addEventListener(ARKitWrapper.ON_ERROR, this._handleOnError.bind(this))
				this._arKitWrapper.addEventListener(ARKitWrapper.AR_TRACKING_CHANGED, this._handleArTrackingChanged.bind(this))
				this._arKitWrapper.waitForInit().then(() => {
					this._arKitWrapper.watch()
				})
			} else {
				this._arKitWrapper.watch()
			}
		} else if (ArgonWrapper.HasArgon()) { // Use Argon 
			if (this._initialized === false) {
				this._initialized = true;
				this._argonWrapper = ArgonWrapper.GetOrCreate();
			}
		} else { // Use device orientation
			if(this._initialized === false){
				this._initialized = true
				this._eyeLevelFrameOfReference = null // not available
				this._deviceOrientation = new Quaternion()
				this._devicePosition = new Vector3()
				this._deviceWorldMatrix = new Float32Array(16)
				this._deviceOrientationTracker = new DeviceOrientationTracker()
				this._deviceOrientationTracker.addEventListener(DeviceOrientationTracker.ORIENTATION_UPDATE_EVENT, this._updateFromDeviceOrientationTracker.bind(this))
				this._stageFrameOfReference._position = [0, -XRDevicePose.SITTING_EYE_HEIGHT, 0]
				this._stageFrameOfReference._emulatedHeight = XRDevicePose.SITTING_EYE_HEIGHT
			}
		}
		window.addEventListener('resize', this._onWindowResize, false)	
		this.running = true
	}

	_stop(){
		if(this.running === false) return			
		// TODO figure out how to stop ARKit and ARCore so that CameraReality can still work
		window.removeEventListener('resize', this._onWindowResize)
		this.running = false
	}

	/*
	Called by a session to indicate that its baseLayer attribute has been set.
	FlatDevice just adds the layer's canvas to DOM elements created by the XR polyfill
	*/
	_handleNewBaseLayer(baseLayer, parameters){
		if (this.baseLayer) {
			this._xr._sessionEls.removeChild(this.baseLayer.context.canvas)
		}

		this.baseLayer = baseLayer;
		if (baseLayer) {
			baseLayer._context.canvas.style.width = "100%";
			baseLayer._context.canvas.style.height = "100%";
			baseLayer.framebufferWidth = this._xr._sessionEls.clientWidth;
			baseLayer.framebufferHeight = this._xr._sessionEls.clientHeight;
			
			if (!this._keepDocumentBodyVisible) {
				document.body.style.display = 'none'
				document.documentElement.style.height = '0'
			}
			this._xr._realityEls.style.display = ''
			this._xr._sessionEls.style.display = ''
			this._xr._sessionEls.appendChild(baseLayer.context.canvas)

			const immersiveViewportSettings = document.createElement('meta')
			immersiveViewportSettings.id = 'immersive-viewport-settings'
			immersiveViewportSettings.name = 'viewport'
			immersiveViewportSettings.content = 'width=device-width, user-scalable=no, minimum-scale=1.0, maximum-scale=1.0, viewport-fit=cover'
			document.head.appendChild(immersiveViewportSettings)
		} else {
			delete document.body.style.display
			delete document.documentElement.style.height
			this._xr._realityEls.style.display = 'none'
			this._xr._sessionEls.style.display = 'none'
			const immersiveViewportSettings = document.queryElement('#immersive-viewport-settings')
			document.head.removeChild(immersiveViewportSettings)
		}

		if (this._argonWrapper) {
			if (this._immersiveSession) {
				this._argonWrapper.setImmersiveMode(parameters.type)
			} else {
				this._argonWrapper.setImmersiveMode('none')
			}
		}
	}

	/*
	Called after animation frame callbacks are fired in the app
	*/
	_beforeAnimationFrame(){
		if(this._vrFrameData !== null){
			this._updateFromVRDevice()
		}

		if (this._argonWrapper !== null) {
			var frameState = this._argonWrapper.frameState
			var views = frameState.views

			this._views.length = 0
			for (var view of views) {
				if (view.type === 'postprocess') continue;
				let xrView = new XRView(
					view.projectionMatrix, 
					view.eyeDisplacementMatrix,
					view.normalizedViewport,
					view.type === 'righteye' ? 'right' : 'left'
				)
				this._views.push(xrView)
			}

			this._pose._transform = this._argonWrapper.getEntityTransform('xr.device')
			this._eyeLevelFrameOfReference._transform = this._argonWrapper.getEntityTransform('xr.eye-level')
			this._stageFrameOfReference._transform = this._argonWrapper.getEntityTransform('xr.stage')

			if (this.baseLayer) {
				this.baseLayer.framebufferWidth = frameState.immersiveSize.width * frameState.contentScaleFactor
				this.baseLayer.framebufferHeight = frameState.immersiveSize.height * frameState.contentScaleFactor
			}
		} 
	}

	_requestAnimationFrame(callback){
		if (this._argonWrapper !== null) {
			return this._argonWrapper.requestAnimationFrame(callback)
		} else {
			return super._requestAnimationFrame(callback);
		}
	}

	_cancelAnimationFrame(handle){
		if (this._argonWrapper !== null) {
			return this._argonWrapper.cancelAnimationFrame(callback)
		} else {
			return super._cancelAnimationFrame(callback);	
		}
	}


	_updateFromVRDevice(){
		this._vrDisplay.getFrameData(this._vrFrameData)
		this._views[0].setProjectionMatrix(this._vrFrameData.leftProjectionMatrix)
		this._deviceOrientation.set(...this._vrFrameData.pose.orientation)
		this._devicePosition.set(...this._vrFrameData.pose.position)
		MatrixMath.mat4_fromRotationTranslation(this._deviceWorldMatrix, this._deviceOrientation.toArray(), this._devicePosition.toArray())
		
		this._pose._transform = this._deviceWorldMatrix
		this._eyeLevelFrameOfReference._transform = this._vrDisplay.capabilities.hasPosition ? this.__IDENTITY : null

		// stage position is emulated
		this._stageFrameOfReference._position = [0,-XRDevicePose.SITTING_EYE_HEIGHT, 0]
		this._stageFrameOfReference._emulatedHeight = XRDevicePose.SITTING_EYE_HEIGHT
	}

	_updateFromDeviceOrientationTracker(){
		// TODO set XRView's FOV
		this._deviceOrientationTracker.getOrientation(this._deviceOrientation)
		MatrixMath.mat4_fromRotationTranslation(this._deviceWorldMatrix, this._deviceOrientation.toArray(), this._devicePosition.toArray())
		
		this._pose._transform = this._deviceWorldMatrix
		// eye level frame of reference not supported
		
		// stage pose is emulated
		this._stageFrameOfReference._position = [0,-XRDevicePose.SITTING_EYE_HEIGHT, 0]
		this._stageFrameOfReference._emulatedHeight = XRDevicePose.SITTING_EYE_HEIGHT
	}

	_handleARKitUpdate(...params){
		const cameraTransformMatrix = this._arKitWrapper.getData('camera_transform')
		if (cameraTransformMatrix) {
			this._pose._transform = cameraTransformMatrix
			this._eyeLevelFrameOfReference._transform = this.__IDENTITY
		} else {
			console.log('no camera transform', this._arKitWrapper.rawARData)
			this._eyeLevelFrameOfReference._transform = null // eyeLevelPose does not get emulated
		}

		// stage pose is emulated for now
		// TODO: use hit tests to determine actual floor offset
		this._stageFrameOfReference._position = [0,-XRDevicePose.SITTING_EYE_HEIGHT, 0]
		this._stageFrameOfReference._emulatedHeight = XRDevicePose.SITTING_EYE_HEIGHT

		const cameraProjectionMatrix = this._arKitWrapper.getData('projection_camera')
		if(cameraProjectionMatrix){
			this._views[0].setProjectionMatrix(cameraProjectionMatrix)
		} else {
			console.log('no projection camera', this._arKitWrapper.rawARData)
		}
	}

	_handleARKitInit(ev){
		setTimeout(() => {
			this._arKitWrapper.watch({
				location: true,
				camera: true,
				objects: true,
				light_intensity: true
			})
		}, 1000)
	}

	_handleARKitWindowResize(ev){
		if (this.baseLayer) {
			this.baseLayer.framebufferWidth = ev.detail.width;
			this.baseLayer.framebufferHeight = ev.detail.height;
		}
	}

	_handleOnError(ev){
		//"domain": "error domain",
		//"code": 1234,
		//"message": "error message"
		// Ex: > {code: 3, message: "error.localizedDescription", domain: "error.domain"}
	}

	_handleArTrackingChanged(ev){
		// ev.detail values
		// #define WEB_AR_TRACKING_STATE_NORMAL               @"ar_tracking_normal"
		// #define WEB_AR_TRACKING_STATE_LIMITED              @"ar_tracking_limited"
		// #define WEB_AR_TRACKING_STATE_LIMITED_INITIALIZING @"ar_tracking_limited_initializing"
		// #define WEB_AR_TRACKING_STATE_LIMITED_MOTION       @"ar_tracking_limited_excessive_motion"
		// #define WEB_AR_TRACKING_STATE_LIMITED_FEATURES     @"ar_tracking_limited_insufficient_features"
		// #define WEB_AR_TRACKING_STATE_NOT_AVAILABLE        @"ar_tracking_not_available"
	}

	_createSession(parameters){
		this._start()
		return super._createSession(parameters)
	}

	//attribute EventHandler ondeactivate; // FlatDevice never deactivates
}