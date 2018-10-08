import Reality from '../Reality.js'
import XRAnchor from '../XRAnchor.js'

import XRLightEstimate from '../XRLightEstimate.js'

import ARKitWrapper from '../platform/ARKitWrapper.js'
import ArgonWrapper from '../platform/ArgonWrapper.js'
import ARCoreCameraRenderer from '../platform/ARCoreCameraRenderer.js'
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

	constructor(device){
		super(device, 'Camera', true, true)

		this._initialized = false
		this._running = false
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

	_requestTracker(name, options) {
		switch(name) {
			case 'ARGON_vuforia': 
				return ArgonVuforiaTracker._requestTracker(this, options)
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
			for (let anchor of this._anchors.values()) {
				anchor._transform = this._argonWrapper.getAnchorTransform(anchor.uid)
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
		let anchor = this._anchors.get(uid) || null
		if(anchor === null){
			anchor = new XRAnchor(uid)
			this._anchors.set(uid, anchor)
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
			this._argonWrapper.createMidAirAnchor(anchor.uid, anchor._transform)
		}
		// ARCore as implemented in the browser does not offer anchors except on a surface, so we just use untracked anchors
		this._anchors.set(anchor.uid, anchor)
		return anchor.uid
	}

	_requestHitTest(normalizedScreenX, normalizedScreenY){
		return new Promise((resolve, reject) => {
			if(this._arKitWrapper !== null){
				
				// Perform a hit test using the ARKit integration
				this._arKitWrapper.hitTest(normalizedScreenX, normalizedScreenY, ARKitWrapper.HIT_TEST_TYPE_EXISTING_PLANES).then(hitResults => {
					const hitResult = this._pickARKitHit(hitResults)

					const hit = new XRHit
					hit._transform = hitResult.world_transform
					hit._targetAnchor = this._getAnchor(hitResult.uuid)

					resolve([hit])
				})

			} else if(this._vrDisplay !== null){

				// Perform a hit test using the ARCore data
				const hitResults = this._vrDisplay.hitTest(normalizedScreenX, normalizedScreenY)
				hitResults.sort((a, b) => a.distance - b.distance)

				const hits = []
				for (let i=0; i<hitResults.length; i++) {
					const hitResult = hitResults[i]
					const hit = new XRHit
					hit._targetAnchor = this._getAnchor(hitResult.uuid)
					hit._transform = hitResult.modelMatrix
					hits[i] = hit
				}
				resolve(hits)

			} else if (this._argonWrapper !== null) {
				this._argonWrapper.requestHitTest(normalizedScreenX, normalizedScreenY).then((hitResults)=>{
					const hits = []
					for (let i=0; i<hitResults.length; i++) {
						const hitResult = hitResults[i] // {id:string, transform:Float32Array[16]}
						const hit = new XRHit(hitResult.id)
						hit._transform = hitResult.pose
						hits[i] = hit
					}
					resolve(hits)
				})
			} else {
				resolve([]) // No platform support for finding anchors
			}
		})
	}

	_removeAnchor(uid){
		// returns void
		// TODO talk to ARKit to delete an anchor
		this._anchors.delete(uid)
	}

	_pickARKitHit(data) {
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

	_hitTest(normalizedScreenX, normalizedScreenY) {
		if(this._arKitWrapper !== null){
			// Perform a hit test using the ARKit integration
			let hitResults = this._arKitWrapper.hitTestNoAnchor(normalizedScreenX, normalizedScreenY);
			const hits = []
			for (let i = 0; i < hitResults.length; i++) {
				const result = hits[i] = new XRHit()
				result._transform = hitResults[i].modelMatrix
			}
			return hits;

		} else if(this._vrDisplay !== null) {

			// Perform a hit test using the ARCore data
			let hitResults = this._vrDisplay.hitTest(normalizedScreenX, normalizedScreenY)
			const hits = []
			for (let i = 0; i < hitResults.length; i++) {
				const result = hits[i] = new XRHit()
				result._transform = hitResults[i].modelMatrix
			}
			return hits;

		} else if (this._argonWrapper !== null) {
			const centerHitTransform = this._argonWrapper.getEntityTransform('xr.center-hit')
			if (!centerHitTransform) return []
			const hit = new XRHit()
			hit._transform = centerHitTransform
			return [hit]
		} else {
			return [] // No platform support for finding anchors
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
