import XRDevice from '../XRDevice.js'
import XRView from '../XRView.js'
import XRSession from '../XRSession.js'
import XRFieldOfView from '../XRFieldOfView.js'

import MatrixMath from '../fill/MatrixMath.js'
import Quaternion from '../fill/Quaternion.js'
import Vector3 from '../fill/Vector3.js'

import DeviceOrientationTracker from '../fill/DeviceOrientationTracker.js'
import ARKitWrapper from '../platform/ARKitWrapper.js'
import XRDevicePose from '../XRDevicePose.js';

/*
HeadMountedDevice wraps a WebVR 1.1 display, like a Vive, Rift, or Daydream.
*/
export default class HeadMountedDevice extends XRDevice {

	static _requestDevice(xr, vrDisplay) {
		return Promise.resolve().then(()=>{
			if (!vrDisplay || !vrDisplay.capabilities.canPresent) 
				throw new Error('HeadMountedDevice is not available')
			return new HeadMountedDevice(xr, vrDisplay)
		})
	}

	constructor(xr, vrDisplay){
		super(xr, vrDisplay.capabilities.hasExternalDisplay)
		this._vrDisplay = vrDisplay
		this._vrFrameData = new VRFrameData()

		// The view projection matrices will be reset using VRFrameData during this._handleNewFrame
		const fov = 50/2;
		const fovs = new XRFieldOfView(fov, fov, fov, fov)
		const depthNear = 0.1
		const depthFar = 1000
		this._leftView = new XRView(fovs, depthNear, depthFar, XRView.LEFT)
		this._rightView = new XRView(fovs, depthNear, depthFar, XRView.RIGHT)
		this._views = [this._leftView, this._rightView]

		// These will be used to set the head and eye level poses during this._handleNewFrame
		this._deviceOrientation = new Quaternion()
		this._devicePosition = new Vector3()
		
		this._IDENTITY = MatrixMath.mat4_generateIdentity()
		this.__workingMatrix = new Float32Array(16)

	}

	/*
	Called via the XRSession.requestAnimationFrame
	*/
	_requestAnimationFrame(callback){
		if(this._vrDisplay.isPresenting){
			this._vrDisplay.requestAnimationFrame(callback)
		} else {
			window.requestAnimationFrame(callback)
		}
	}

	/*
	Called by a session to indicate that its baseLayer attribute has been set.
	This is where the VRDisplay is used to create a session 
	*/
	_handleNewBaseLayer(baseLayer){
		if (!baseLayer) {
			if (this._vrDisplay.isPresenting) this._vrDisplay.exitPresent()
		}

		this._vrDisplay.requestPresent([{
			source: baseLayer._context.canvas
		}]).then(() => {
			const leftEye = this._vrDisplay.getEyeParameters('left')
			const rightEye = this._vrDisplay.getEyeParameters('right')
			baseLayer.framebufferWidth = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2
			baseLayer.framebufferHeight = Math.max(leftEye.renderHeight, rightEye.renderHeight)
			baseLayer._context.canvas.style.position = 'absolute'
			baseLayer._context.canvas.style.bottom = '1px'
			baseLayer._context.canvas.style.right = '1px'
			baseLayer._context.canvas.style.width = "100%";
			baseLayer._context.canvas.style.height = "100%";
				document.body.appendChild(baseLayer._context.canvas)
		}).catch(e => {
			console.error('Unable to init WebVR 1.1 display', e)
		})
	}

	_stop(){
		// TODO figure out how to stop ARKit and ARCore so that CameraReality can still work
		if(this.running === false) return
		this.running = false
	}

	/*
	Called before animation frame callbacks are fired in the app
	*/
	_beforeAnimationFrame(){
		if (this._vrDisplay.isPresenting){
			this._updateFromVRFrameData()
		}
	}

	/*
	Called after animation frame callbacks are fired in the app
	*/
	_afterAnimationFrame(){
		if (this._vrDisplay.isPresenting){
			this._vrDisplay.submitFrame()
		}
	}

	_supportedCreationParameters(parameters){
		return parameters.type === XRSession.REALITY && parameters.exclusive === true
	}

	_updateFromVRFrameData(){
		this._vrDisplay.getFrameData(this._vrFrameData)
		this._leftView.setViewMatrix(this._vrFrameData.leftViewMatrix)
		this._rightView.setViewMatrix(this._vrFrameData.rightViewMatrix)
		this._leftView.setProjectionMatrix(this._vrFrameData.leftProjectionMatrix)
		this._rightView.setProjectionMatrix(this._vrFrameData.rightProjectionMatrix)
		if(this._vrFrameData.pose){
			if(this._vrFrameData.pose.orientation){
				this._deviceOrientation.set(...this._vrFrameData.pose.orientation)
			}
			if(this._vrFrameData.pose.position){
				this._devicePosition.set(...this._vrFrameData.pose.position)
			}
			const deviceWorldMatrix = MatrixMath.mat4_fromRotationTranslation(this.__workingMatrix, this._deviceOrientation.toArray(), this._devicePosition.toArray())
			if(this._vrDisplay.stageParameters && this._vrDisplay.stageParameters.sittingToStandingTransform){
				const sittingToStandingTransform = this._vrDisplay.stageParameters.sittingToStandingTransform
				this._pose._transform = MatrixMath.mat4_multiply(deviceWorldMatrix, sittingToStandingTransform, deviceWorldMatrix)
				this._eyeLevelFrameOfReference._transform = MatrixMath.mat4_invert(this.__workingMatrix, sittingToStandingTransform)				
				this._stageFrameOfReference._transform = this._IDENTITY
			} else {
				this._pose._transform = deviceWorldMatrix
				this._eyeLevelFrameOfReference._transform = this._IDENTITY	
				// stage pose is emulated	
				const stagePosition = [0,-XRDevicePose.SITTING_EYE_HEIGHT, 0]
				this._stageFrameOfReference._position = stagePosition
				this._stageFrameOfReference._emulatedHeight = XRDevicePose.SITTING_EYE_HEIGHT
			}			
		}
	}
}