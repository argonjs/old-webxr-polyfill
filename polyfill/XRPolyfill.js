import XRDevice from './XRDevice.js'
import XRSession from './XRSession.js'
import XRSessionCreateParameters from './XRSessionCreateParameters.js'
import Reality from './Reality.js'
import XRPointCloud from './XRPointCloud.js'
import XRLightEstimate from './XRLightEstimate.js'
import XRAnchor from './XRAnchor.js'
import XRPlaneAnchor from './XRPlaneAnchor.js'
import XRHit from './XRHit.js'
import XRHitAnchor from './XRHitAnchor.js'
import XRFrameOfReference from './XRFrameOfReference.js'
import XRStageBounds from './XRStageBounds.js'
import XRStageBoundsPoint from './XRStageBoundsPoint.js'
import XRFrame from './XRFrame.js'
import XRView from './XRView.js'
import XRViewport from './XRViewport.js'
import XRCoordinateSystem from './XRCoordinateSystem.js'
import XRDevicePose from './XRDevicePose.js'
import XRLayer from './XRLayer.js'
import XRWebGLLayer from './XRWebGLLayer.js'

import EventHandlerBase from './fill/EventHandlerBase.js'
import FlatDevice from './device/FlatDevice.js'
import HeadMountedDevice from './device/HeadMountedDevice.js'

/*
XRPolyfill implements the window.XR functionality as a polyfill

Code below will check for window.XR and if it doesn't exist will install this polyfill,
so you can safely include this script in any page.
*/
class XRPolyfill extends EventHandlerBase {
	constructor(){
		super()
		window.XRDevice = XRDevice
		window.XRSession = XRSession
		window.XRSessionCreateParameters = XRSessionCreateParameters
		window.Reality = Reality
		window.XRPointCloud = XRPointCloud
		window.XRLightEstimate = XRLightEstimate
		window.XRAnchor = XRAnchor
		window.XRPlaneAnchor = XRPlaneAnchor
		window.XRHit = XRHit
		window.XRHitAnchor = XRHitAnchor
		window.XRFrameOfReference = XRFrameOfReference
		window.XRStageBounds = XRStageBounds
		window.XRStageBoundsPoint = XRStageBoundsPoint
		window.XRFrame = window.XRPresentationFrame = XRFrame
		window.XRView = XRView
		window.XRViewport = XRViewport
		window.XRCoordinateSystem = XRCoordinateSystem
		window.XRDevicePose = XRDevicePose
		window.XRLayer = XRLayer
		window.XRWebGLLayer = XRWebGLLayer

		// These elements are at the beginning of the document element and absolutely positioned to fill the entire window
		// Sessions and realities add their elements to these divs so that they are in the right render order
		this._sessionEls = document.createElement('div')
		this._sessionEls.setAttribute('class', 'webxr-sessions')
		this._realityEls = document.createElement('div')
		this._realityEls.setAttribute('class', 'webxr-realities')
		for(let el of [this._sessionEls, this._realityEls]){
			el.style.position = 'fixed'
			el.style.width = '100%'
			el.style.height = '100%'
			el.style.display = 'none'
		}

		document.addEventListener('DOMContentLoaded', () => {
			document.documentElement.prepend(this._sessionEls)
			document.documentElement.prepend(this._realityEls) // realities must render behind the sessions
		})
	}

	requestDevice(){
		return Promise.resolve().then(()=>{
			if (isAppleWebView()) return null // don't use vr display in ios apps

			if(typeof navigator.getVRDisplays === 'function') {
				return navigator.getVRDisplays().then(displays => {
					let passThroughCameraDisplay = null
					let presentableDisplay = null
					let anyDisplay = null
					for(let display of displays){
						if (display === null) continue
						if (display.capabilities.hasPassThroughCamera) {
							passThroughCameraDisplay = display
							continue
						}
						if (display.capabilities.canPresent) {
							presentableDisplay = display
							continue
						}
						if (!anyDisplay) anyDisplay = display
					}
					return passThroughCameraDisplay || presentableDisplay || anyDisplay // preference order
				})
			}
		}).then(vrDisplay => {
			return HeadMountedDevice._requestDevice(this, vrDisplay).catch(()=>{
				return FlatDevice._requestDevice(this, vrDisplay)
			})
		})
	}

	// For backwards compatability. TO BE REMOVED.
	getDisplays() {
		console.warn('getDisplays() is deprecated, running in compatability mode. '
			+ 'All session requests will treat "immersive" parameter as true, and document '
			+ 'will remain visible during "flat" immersive sessions.'
			+ 'Switch to requestDevice() for normal functionality');
		return this.requestDevice().then(device => {
			device._forceImmersive = true
			device._keepDocumentBodyVisible = true
			device._onlyAR = true
			return [device]
		})
	}

	//attribute EventHandler ondevicechange;
}

/* Install XRPolyfill if navigator.xr does not exist */
if(typeof navigator.xr === 'undefined') navigator.xr = new XRPolyfill()
if(typeof navigator.XR === 'undefined') navigator.XR = navigator.xr // deprecated

function isAppleWebView() {
	return navigator.userAgent.indexOf('AppleWebKit') && navigator.userAgent.indexOf('Safari') === -1;
}