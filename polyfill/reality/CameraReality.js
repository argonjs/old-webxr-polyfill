import Reality from '../Reality.js'
import XRAnchor from '../XRAnchor.js'

import XRLightEstimate from '../XRLightEstimate.js'

import MatrixMath from '../fill/MatrixMath.js'
import Quaternion from '../fill/Quaternion.js'

import ARKitWrapper from '../platform/ARKitWrapper.js'
import ArgonWrapper from '../platform/ArgonWrapper.js'
import ARCoreCameraRenderer from '../platform/ARCoreCameraRenderer.js'
import XRCoordinateSystem from '../XRCoordinateSystem.js';
import XRHit from '../XRHit.js';

import ArgonVuforiaTracker from '../tracker/ArgonVuforiaTracker.js'

/*
CameraReality displays the forward facing camera.

If this is running in the iOS ARKit wrapper app, the camera data will be displayed in a Metal layer below the WKWebKit layer.
If this is running in the Google ARCore Chrome application, it will create a canvas element and use the ARCore provided camera data.
If there is no ARKit or ARCore available, it will use WebRTC's MediaStream to render camera data into a canvas.
*/
export default class CameraReality extends Reality {

	static supportsVRDisplay(vrDisplay) {
		return vrDisplay.capabilities.hasPassThroughCamera // This is the ARCore extension to WebVR 1.1
	}

	constructor(xr, device){
		super(xr, 'Camera', true, true)

		this._initialized = false
		this._running = false
		this._device = device
		this._lightEstimate = new XRLightEstimate();

		// This is used if we have access to ARKit 
		this._arKitWrapper = null

		// This is used if we have access to Argon
		this._argonWrapper = null

		// These are used if we do not have access to ARKit
		this._mediaStream = null
		this._videoEl = null

		// These are used if we're using the Google ARCore web app
		this._vrDisplay = null
		this._arCoreCameraRenderer = null
		this._arCoreCanvas = null
		this._elContext = null

		if (device._vrDisplay) {
			if (!CameraReality.supportsVRDisplay(device._vrDisplay))
				throw new Error('CameraReality is not supported on current device')
			this._vrDisplay =  device._vrDisplay
			if (!window.WebARonARKitSetData) {							
				this._arCoreCanvas = document.createElement('canvas')
				this._xr._realityEls.appendChild(this._arCoreCanvas)
				this._arCoreCanvas.width = window.innerWidth
				this._arCoreCanvas.height = window.innerHeight
				this._elContext = this._arCoreCanvas.getContext('webgl')
				if(this._elContext === null){
					throw 'Could not create CameraReality GL context'
				}
			}
		}

		window.addEventListener('resize', () => {
			if(this._arCoreCanvas){
				this._arCoreCanvas.width = window.innerWidth
				this._arCoreCanvas.height = window.innerHeight
			}
		}, false)
	}

	_requestTracker(name) {
		switch(name) {
			case 'ARGON_vuforia': 
				return ArgonVuforiaTracker._requestTracker()
		}
		return null
	}

	/*
	Called before animation frame callbacks are fired in the app
	Anchors should be updated here
	*/
	_beforeAnimationFrame(){
		super._beforeAnimationFrame()

		if(this._vrDisplay){
			if (this._arCoreCameraRenderer) {
				this._arCoreCameraRenderer.render()
			}
		}

		if (this._argonWrapper) {
			for (let anchor in this._anchors) {
				anchor.coordinateSystem._transform = this._argonWrapper.getAnchorTransformRelativeToTracker(anchor.uid)
			}
		}
		// TODO update the anchor positions using ARCore or ARKit
	}

	_start(){
		if(this._running) return
		this._running = true

		if(this._vrDisplay !== null){ // Using WebAR
			if (window.WebARonARKitSetData) {
				// WebARonARKit renders camera separately
			} else {
				this._arCoreCameraRenderer = new ARCoreCameraRenderer(this._vrDisplay, this._elContext)
			}
			this._initialized = true
		} else if(ARKitWrapper.HasARKit()){ // Using ARKit
			if(this._initialized === false){
				this._initialized = true
				this._arKitWrapper = ARKitWrapper.GetOrCreate()
				this._arKitWrapper.addEventListener(ARKitWrapper.WATCH_EVENT, this._handleARKitWatch.bind(this))
				this._arKitWrapper.waitForInit().then(() => {
					this._arKitWrapper.watch()
				})
			} else {
				this._arKitWrapper.watch()
			}
		} else if (ArgonWrapper.HasArgon()) { // Using Argon
			if (this._initialized === false) {
				this._initialized = true
				this._argonWrapper = ArgonWrapper.GetOrCreate()
				this._argonVuforiaExtension = new ARGON_vuforia(this)
			}
		} else { // Using WebRTC
			if(this._initialized === false){
				this._initialized = true
				return navigator.mediaDevices.getUserMedia({
					audio: false,
					video: { facingMode: "environment" }
				}).then(stream => {
					this._videoEl = document.createElement('video')
					this._xr._realityEls.appendChild(this._videoEl)
					this._videoEl.setAttribute('class', 'camera-reality-video')
                    this._videoEl.setAttribute('playsinline', true);
					this._videoEl.style.width = '100%'
					this._videoEl.style.height = '100%'
					this._videoEl.style.objectFit = 'fill'
					this._videoEl.srcObject = stream
					this._videoEl.play()
				}).catch(err => {
					console.error(err)
					this._initialized = false
					this._running = false
					throw new Error('Could not set up video stream')
				})
			} else {
				this._xr._realityEls.appendChild(this._videoEl)
				this._videoEl.play()
			}
		}
	}

	_stop(){
		if(this._running === false) return
		this._running = false
		if(ARKitWrapper.HasARKit()){
			if(this._arKitWrapper === null){
				return
			}
			this._arKitWrapper.stop()
		} else if(this._arCoreCanvas){
			this._xr._realityEls.removeChild(this._arCoreCanvas)
			this._arCoreCanvas = null
		} else if(this._videoEl !== null){
			this._videoEl.pause()
			this._xr._realityEls.removeChild(this._videoEl)
		}
	}

	_handleARKitWatch(ev){
		if(ev.detail && ev.detail.objects){
			for(let anchorInfo of ev.detail.objects){
				this._updateAnchorFromARKitUpdate(anchorInfo.uuid, anchorInfo)
			}

		}
	}

	_handleARKitAddObject(anchorInfo){
		this._updateAnchorFromARKitUpdate(anchorInfo.uuid, anchorInfo)
	}

	_updateAnchorFromARKitUpdate(uid, anchorInfo){
		const anchor = this._anchors.get(uid) || null
		if(anchor === null){
			// console.log('unknown anchor', anchor)
			return
		}
		// This assumes that the anchor's coordinates are in the tracker coordinate system
		anchor._transform = anchorInfo.transform
	}

	_addAnchor(anchor){
		if(this._arKitWrapper !== null){
			this._arKitWrapper.addAnchor(anchor.uid, anchor._transform).then(
				detail => this._handleARKitAddObject(detail)
			)
		}
		if (this._argonWrapper !== null) {
			this._argonWrapper.addAnchor(anchor.uid, anchor._transform)
		}
		// ARCore as implemented in the browser does not offer anchors except on a surface, so we just use untracked anchors
		this._anchors.set(anchor.uid, anchor)
		return anchor.uid
	}

	_requestHitTest(normalizedScreenX, normalizedScreenY){
		return new Promise((resolve, reject) => {
			if(this._arKitWrapper !== null){
				
				// Perform a hit test using the ARKit integration
				this._arKitWrapper.hitTest(normalizedScreenX, normalizedScreenY, ARKitWrapper.HIT_TEST_TYPE_EXISTING_PLANES).then(hits => {
					if(hits.length === 0){
						resolve(null)
						return
					}
					const hit = this._pickARKitHit(hits)

					const hitTestResult = new XRHit()
					hitTestResult._transform = hit.world_transform
					if (hit.uuid && (hitTestResult._anchor = this._getAnchor(hit.uuid) === null)) {
						console.log('unknown anchor', hit.uuid) // this anchor should already exist
					}

					resolve([hitTestResult])
				})

			} else if(this._vrDisplay !== null){

				// Perform a hit test using the ARCore data
				let hits = this._vrDisplay.hitTest(normalizedScreenX, normalizedScreenY)
				if(hits.length == 0){
					resolve(null)
					return
				}

				hits.sort((a, b) => a.distance - b.distance)

				const hitTestResults = []
				for (let i=0; i<hits.length; i++) {
					const hit = hits[i]
					const hitTestResult = hitTestResults[i] = new XRHit
					hitTestResult._transform = hit.modelMatrix
					if (hit.uuid && (hitTestResult._anchor = this._getAnchor(hit.uuid) === null)) {
						console.log('unknown anchor', hit.uuid) // this anchor should already exist
					}
				}
				resolve(hitTestResults)

			} else if (this._argonWrapper !== null) {
				this._argonWrapper.hitTest(normalizedScreenX, normalizedScreenY).then((hits)=>{
					if (hits.length === 0) {
						resolve(null)
						return
					}
					const hitTestResults = []
					for (let i=0; i<hits.length; i++) {
						const hit = hits[i]
						const hitTestResult = hitTestResults[i] = new XRHit(hit.resultId)
						hitTestResult._transform = hitTestResults[0].transform
						if (hit.uuid && (hitTestResult._anchor = this._getAnchor(hit.anchorId) === null)) {
							console.log('unknown anchor', hit.uuid) // this anchor should already exist
						}
					}
					resolve(hitTestResults)
				})
			} else {
				resolve(null) // No platform support for finding anchors
			}
		})
	}

	_removeAnchor(uid){
		// returns void
		// TODO talk to ARKit to delete an anchor
		this._anchors.delete(uid)
	}

	_pickARKitHit(data){
		if(data.length === 0) return null
		let info = null

		let planeResults = data.filter(
			hitTestResult => hitTestResult.type != ARKitWrapper.HIT_TEST_TYPE_FEATURE_POINT
		)
		let planeExistingUsingExtentResults = planeResults.filter(
			hitTestResult => hitTestResult.type == ARKitWrapper.HIT_TEST_TYPE_EXISTING_PLANE_USING_EXTENT
		)
		let planeExistingResults = planeResults.filter(
			hitTestResult => hitTestResult.type == ARKitWrapper.HIT_TEST_TYPE_EXISTING_PLANE
		)

		if (planeExistingUsingExtentResults.length) {
			// existing planes using extent first
			planeExistingUsingExtentResults = planeExistingUsingExtentResults.sort((a, b) => a.distance - b.distance)
			info = planeExistingUsingExtentResults[0]
		} else if (planeExistingResults.length) {
			// then other existing planes
			planeExistingResults = planeExistingResults.sort((a, b) => a.distance - b.distance)
			info = planeExistingResults[0]
		} else if (planeResults.length) {
			// other types except feature points
			planeResults = planeResults.sort((a, b) => a.distance - b.distance)
			info = planeResults[0]
		} else {
			// feature points if any
			info = data[0]
		}
		return info
	}

	_hitTest(normalizedScreenX, normalizedScreenY){
		if(this._arKitWrapper !== null){
			// Perform a hit test using the ARKit integration
			let hits = this._arKitWrapper.hitTestNoAnchor(normalizedScreenX, normalizedScreenY);
			if(hits.length == 0){
				return null;
			}
			const hitTestResults = []
			for (let i = 0; i < hits.length; i++) {
				const result = hitTestResults[i] = new XRHit()
				result._transform = hits[i].modelMatrix
			}
			return hitTestResults;

		} else if(this._vrDisplay !== null) {

			// Perform a hit test using the ARCore data
			let hits = this._vrDisplay.hitTest(normalizedScreenX, normalizedScreenY)
			if(hits.length == 0){
				return null;
			}
			const hitTestResults = []
			for (let i = 0; i < hits.length; i++) {
				const result = hitTestResults[i] = new XRHit()
				result._transform = hits[i].modelMatrix
			}
			return hitTestResults;

		} else {

			// use default implementation
			return Reality.prototype._hitTest.call(this, normalizedScreenX, normalizedScreenY)
		}
	}

	_getHasLightEstimate(){
		if(this._arKitWrapper !== null){
			return true;
		}else{
			return false;
		}
	}

	_getLightAmbientIntensity(){
		if(this._arKitWrapper !== null){
			this._lightEstimate.ambientIntensity = this._arKitWrapper.lightIntensity;
			return this._lightEstimate.ambientIntensity;
		}else{
			// No platform support for ligth estimation
			return null;
		}
	}
}
