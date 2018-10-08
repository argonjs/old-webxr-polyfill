/*
	XRExampleBase holds all of the common XR setup, rendering, and teardown code for a THREE.js based app
	It also holds a list of THREE nodes and XRAnchorOffsets which it uses to update the nodes' poses

	Extending classes should be able to focus mainly on rendering their scene and handling user input

	Parameters:
		domElement: an element used to show error messages
		createVirtualReality: if true, create a new empty reality for this app

	WebVR 1.1 displays require that the call to requestPresent be a direct result of an input event like a click.
	If you're trying to use a WebVR 1.1 display then you'll need to pass false in the shouldStartPresenting parameter
	of the constructor and then call this.startPresenting() inside an input event handler.

*/
class XRExampleBase {
	constructor(domElement, createVirtualReality=true, shouldStartPresenting=true){
		this.el = domElement
		this.createVirtualReality = createVirtualReality
		this.shouldStartPresenting = shouldStartPresenting

		this._boundHandleFrame = this._handleFrame.bind(this) // Useful for setting up the requestAnimationFrame callback

		// Set during the XR.requestDevice call below
		this.device = null

		// Set during this.startSession below		
		this.session = null

		// frames of reference
		this.headModelFrameOfReference = null
		this.stageFrameOfReference = null
		this.eyeLevelFrameOfReference = null

		this.scene = new THREE.Scene() // The scene will be rotated and oriented around the camera using the head pose

		this.camera = new THREE.PerspectiveCamera(70, 1024, 1024, 0.1, 1000) // These values will be overwritten by the projection matrix from ARKit or ARCore
		this.scene.add(this.camera)

		// Create a canvas and context for the session layer
		this.glCanvas = document.createElement('canvas')
		this.glContext = this.glCanvas.getContext('webgl')
		if(this.glContext === null){
			this.showMessage('Could not create a WebGL canvas')
			throw new Error('Could not create GL context')
		}

		window.onerror = (mes, src, lino, colno, err) => {
			this.showMessage(mes + ' src:' + src + ' stack:' + new Error().stack)
		}

		// Set up the THREE renderer with the session's layer's glContext
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.glCanvas,
			context: this.glContext,
			antialias: false,
			alpha: true
		})
		this.renderer.setPixelRatio(1)
		this.renderer.autoClear = false
		this.renderer.setClearColor('#000', 0)

		this.floorGroup = new THREE.Group() // This group will eventually be be anchored to the floor (see findFloorAnchor below)

		// a map of XRCoordinateSystem instances and their Object3D proxies to be updated each frame
		this.xrObjects = new Map // XRCoordinateSystem -> Three.js Object3D Map

		if(typeof navigator.XR === 'undefined'){
			this.showMessage('No WebXR API found, usually because the WebXR polyfill has not loaded')
			return
		}

		// Get device and then request a session
		navigator.XR.requestDevice().then(device => {
			this.device = device
			this._startSession()
		}).catch(err => {
			console.error('Error getting XR device', err)
			this.showMessage('Could not get XR device')
		})
	}

	_startSession(){
		let sessionInitParamers = {
			exclusive: true,
			type: this.createVirtualReality ? XRSession.REALITY : XRSession.AUGMENTATION
		}
		if(!this.device.supportsSession(sessionInitParamers)){
			this.showMessage(`Device does not support the session parameters: ${JSON.stringify(sessionInitParamers)}`)
			return
		}
		return this.device.requestSession(sessionInitParamers).then(session => {
			this.session = session
			this.session.depthNear = 0.1
			this.session.depthFar = 1000.0

			// Handle session lifecycle events
			this.session.addEventListener('focus', ev => { this.handleSessionFocus(ev) })
			this.session.addEventListener('blur', ev => { this.handleSessionBlur(ev) })
			this.session.addEventListener('end', ev => { this.handleSessionEnded(ev) })

			const r1 = this.session.requestFrameOfReference('stage').then((frame) => {
				this.stageFrameOfReference = frame
				const stageObject = this.getXRObject3D(frame)
				stageObject.add(this.floorGroup)
			})

			const r2 = this.session.requestFrameOfReference('eye-level').then((frame)=>{
				this.eyeLevelFrameOfReference = frame
			})

			const r3 = this.session.requestFrameOfReference('head-model').then((frame)=>{
				this.headModelFrameOfReference = frame
			})

			return [r1,r2,r3]
		}).then((requestedFrames)=>{

			return Promise.all(requestedFrames.map(framePromise => framePromise.catch(e => e))).then(()=>{
				
				this.frameOfReference = this.headModelFrameOfReference

				if (this.shouldStartPresenting) {
					// Give extending classes the opportunity to initially populate the scene
					this.initializeScene()
					// VR Displays need startPresenting called due to input events like a click
					this.startPresenting()
				}
			})
			
		}).catch(err => {
			console.error('Error requesting session', err)
			this.showMessage('Could not initiate the session')
		})
	}

	/*
		Empties this.el, adds a div with the message text, and shows a button to test rendering the scene to this.el
	*/
	showMessage(messageText){
		let messages = document.getElementsByClassName('common-message')
		if(messages.length > 0){
			var message = messages[0]
		} else {
			var message = document.createElement('div')
			message.style.color = 'green'
			message.setAttribute('class', 'common-message')
			this.el.append(message)
		}
		let div = document.createElement('div')
		div.innerHTML = messageText
		message.appendChild(div)
	}

	/*
	WebVR 1.1 displays require that the call to requestPresent be a direct result of an input event like a click.
	If you're trying to set up a VR display, you'll need to pass false in the shouldStartPresenting parameter of the constructor
	and then call this.startPresenting() inside an input event handler.
	*/
	startPresenting(){
		if(this.session === null){
			this.showMessage('Can not start presenting without a session')
			throw new Error('Can not start presenting without a session')
		}

		// Set the session's base layer into which the app will render
		this.session.baseLayer = new XRWebGLLayer(this.session, this.glContext)

		// Handle layer focus events
		this.session.baseLayer.addEventListener('focus', ev => { this.handleLayerFocus(ev) })
		this.session.baseLayer.addEventListener('blur', ev => { this.handleLayerBlur(ev) })

		this.session.requestAnimationFrame(this._boundHandleFrame)
	}

	// Extending classes can react to these events
	handleSessionFocus(ev){}
	handleSessionBlur(ev){}
	handleSessionEnded(ev){}
	handleLayerFocus(ev){}
	handleLayerBlur(ev){}

	/*
	Extending classes should override this to set up the scene during class construction
	*/
	initializeScene(){}

	/*
	Extending classes that need to update the layer during each frame should override this method
	*/
	updateScene(frame){}

	_handleFrame(frame){
		const nextFrameRequest = this.session.requestAnimationFrame(this._boundHandleFrame)

		const frameOfReference = this.frameOfReference

		let devicePose = frame.getDevicePose(frameOfReference)

		if (!devicePose) return // nothing to do

		// Update xr objects in the scene graph
		for (let xrObject of this.xrObjects.values()) {
			const transform = xrObject.xrCoordinateSystem.getTransformTo(frameOfReference)
			if (transform) {
				xrObject.matrixAutoUpdate = false
				xrObject.matrix.fromArray(transform)
				xrObject.updateMatrixWorld(true)
				if (xrObject.parent !== this.scene) {
					this.scene.add(xrObject)
					console.log('added xrObject ' + xrObject.xrCoordinateSystem.uid || '')
				}
			} else {
				if (xrObject.parent) {
					this.scene.remove(xrObject)
					console.log('removed xrObject ' + xrObject.xrCoordinateSystem.uid || '')
				}
			}
		}

		// Let the extending class update the scene before each render
		this.updateScene(frame)

		// Prep THREE.js for the render of each XRView
		this.renderer.autoClear = false
		this.renderer.setSize(this.session.baseLayer.framebufferWidth, this.session.baseLayer.framebufferHeight, false)
		this.renderer.clear()

		this.camera.matrixAutoUpdate = false

		// Render each view into this.session.baseLayer.context
		for(const view of frame.views){
			// Each XRView has its own projection matrix, so set the camera to use that
			const viewMatrix = devicePose.getViewMatrix(view)
			this.camera.matrix.fromArray(viewMatrix).getInverse(this.camera.matrix)
			this.camera.projectionMatrix.fromArray(view.projectionMatrix)

			// Set up the renderer to the XRView's viewport and then render
			this.renderer.clearDepth()
			const viewport = view.getViewport(this.session.baseLayer)
			this.renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height)
			this.doRender()
		}
		
		this.camera.matrix.fromArray(devicePose.poseModelMatrix)
		this.camera.updateMatrixWorld()

		// this.camera.matrixAutoUpdate = false

		// // Render each view into this.session.baseLayer.context
		// for(const view of frame.views){
		// 	// Each XRView has its own projection matrix, so set the camera to use that
		// 	this.camera.matrixWorldInverse.fromArray(view.viewMatrix)
		// 	this.camera.matrixWorld.fromArray(this.camera.matrixWorldInverse)
		// 	this.camera.projectionMatrix.fromArray(view.projectionMatrix)
		// 	this.camera.matrix.fromArray(devicePose.poseModelMatrix)
		// 	this.camera.updateMatrixWorld(true)

		// 	// Set up the renderer to the XRView's viewport and then render
		// 	this.renderer.clearDepth()
		// 	const viewport = view.getViewport(this.session.baseLayer)
		// 	this.renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height)
		// 	this.doRender()
		// }
	}

	doRender(){
		this.renderer.render(this.scene, this.camera)
	}

	/*
	Get an Object3D representing the given XRCoordinateSystem
	*/
	getXRObject3D(xrCoordinateSystem) {
		let xrObject = this.xrObjects.get(xrCoordinateSystem)
		if (xrObject) return xrObject

		xrObject = new THREE.Object3D()
		xrObject.xrCoordinateSystem = xrCoordinateSystem
		this.xrObjects.set(xrCoordinateSystem, xrObject)
		return xrObject
	}

	/*
	Update an Object3D coorresponding to an XRCoordinateSystem by positioning it relative to the target XRCOordinateSystem
	*/
	_updateXRObject3D(xrObject, targetXRCoordinateSystem) {
	}
}

/*
If you want to just put virtual things on surfaces, extend this app and override `createSceneGraphNode`
*/
class ThingsOnSurfacesApp extends XRExampleBase {
	constructor(domElement){
		super(domElement, false)
		this.el.addEventListener('touchstart', this._onTouchStart.bind(this), false)
	}

	// Return a THREE.Object3D of some sort to be placed when a surface is found
	createSceneGraphNode(){
		throw new Error('Extending classes should implement createSceneGraphNode')
		/*
		For example:
		let geometry = new THREE.BoxBufferGeometry(0.1, 0.1, 0.1)
		let material = new THREE.MeshPhongMaterial({ color: '#99FF99' })
		return new THREE.Mesh(geometry, material)
		*/
	}


	// Called once per frame, before render, to give the app a chance to update this.scene
	updateScene(frame, frameOfReference){}

	// Save screen taps as normalized coordinates for use in this.updateScene
	_onTouchStart(ev){
		if (!ev.touches || ev.touches.length === 0) {
			console.error('No touches on touch event', ev)
			return
		}
		//save screen coordinates normalized to -1..1 (0,0 is at center and 1,1 is at top right)
		const normalizedX = ev.touches[0].clientX / window.innerWidth
		const normalizedY = ev.touches[0].clientY / window.innerHeight

		this.session.requestHitTest(normalizedX, normalizedY).then((hits)=>{
			if (hits.length === 0) return
			this.session.requestAnchorFromHit(hits[0]).then(hitAnchor => {
				const hitAnchorObject3D = this.getXRObject3D(hitAnchor)
				hitAnchorObject3D.add(this.createSceneGraphNode())
			})
		})
	}
}

function fillInGLTFScene(path, scene, position=[0, 0, -2], scale=[1, 1, 1]){
	let ambientLight = new THREE.AmbientLight('#FFF', 1)
	scene.add(ambientLight)

	let directionalLight = new THREE.DirectionalLight('#FFF', 0.6)
	scene.add(directionalLight)

	loadGLTF(path).then(gltf => {
		gltf.scene.scale.set(...scale)
		gltf.scene.position.set(...position)
		//gltf.scene.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / -2)
		scene.add(gltf.scene)
	}).catch((...params) =>{
		console.error('could not load gltf', ...params)
	})
}

function loadGLTF(url){
	return new Promise((resolve, reject) => {
		let loader = new THREE.GLTFLoader()
		loader.load(url, (gltf) => {
			if(gltf === null){
				reject()
			}
			if(gltf.animations && gltf.animations.length){
				let mixer = new THREE.AnimationMixer(gltf.scene)
				for(let animation of gltf.animations){
					mixer.clipAction(animation).play()
				}
			}
			resolve(gltf)
		})
	})
}

function loadObj(baseURL, geometry){
	return new Promise(function(resolve, reject){
		const mtlLoader = new THREE.MTLLoader()
		mtlLoader.setPath(baseURL)
		const mtlName = geometry.split('.')[geometry.split(':').length - 1] + '.mtl'
		mtlLoader.load(mtlName, (materials) => {
			materials.preload()
			let objLoader = new THREE.OBJLoader()
			objLoader.setMaterials(materials)
			objLoader.setPath(baseURL)
			objLoader.load(geometry, (obj) => {
				resolve(obj)
			}, () => {} , (...params) => {
				console.error('Failed to load obj', ...params)
				reject(...params)
			})
		})
	})
}

function requestFullScreen(){
	if (document.body.requestFullscreen) {
		document.body.requestFullscreen()
	} else if (document.body.msRequestFullscreen) {
		document.body.msRequestFullscreen()
	} else if (document.body.mozRequestFullScreen) {
		document.body.mozRequestFullScreen()
	} else if (document.body.webkitRequestFullscreen) {
		document.body.webkitRequestFullscreen()
	}
}

function exitFullScreen(){
	if (document.exitFullscreen) {
		document.exitFullscreen();
	} else if (document.mozCancelFullScreen) {
		document.mozCancelFullScreen()
	} else if (document.webkitExitFullscreen) {
		document.webkitExitFullscreen()
	} else if (document.msExitFullscreen) {			
		document.msExitFullscreen()
	}
}


/*
Rate limit a function call. Wait is the minimum number of milliseconds between calls.
If leading is true, the first call to the throttled function is immediately called.
If trailing is true, once the wait time has passed the function is called. 

This code is cribbed from https://github.com/jashkenas/underscore
*/
window.throttle = function(func, wait, leading=true, trailing=true) {
	var timeout, context, args, result
	var previous = 0

	var later = function() {
		previous = leading === false ? 0 : Date.now()
		timeout = null
		result = func.apply(context, args)
		if (!timeout) context = args = null
	}

	var throttled = function() {
		var now = Date.now()
		if (!previous && leading === false) previous = now
		var remaining = wait - (now - previous)
		context = this
		args = arguments
		if (remaining <= 0 || remaining > wait) {
		if (timeout) {
			clearTimeout(timeout)
			timeout = null
		}
		previous = now
		result = func.apply(context, args)
		if (!timeout) context = args = null
		} else if (!timeout && trailing !== false) {
		timeout = setTimeout(later, remaining)
		}
		return result
	}

	throttled.cancel = function() {
		clearTimeout(timeout)
		previous = 0
		timeout = context = args = null
	}

	return throttled
}

window.throttledConsoleLog = throttle((...params) => {
	console.log(...params)
}, 1000)

function hideMe(elem) { elem.style.display = 'none' }
