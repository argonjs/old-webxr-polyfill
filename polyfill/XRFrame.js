import XRAnchor from './XRAnchor.js'
import XRDevicePose from './XRDevicePose.js'
import MatrixMath from "./fill/MatrixMath.js"

/*
XRFrame provides all of the values needed to render a single frame of an XR scene to the XRDisplay.
*/
export default class XRFrame {
	constructor(session){
		this._session = session

		// if (this._session._reality._argonWrapper) {
		// 	this.hitTest = undefined // Argon does not support synchronous hit test
		// 	this.hitTestNoAnchor = undefined // Argon does not support synchronous hit test
		// }
	}

	get session(){ return this._session }

	get views(){
		//readonly attribute FrozenArray<XRView> views;
		return this._session._device._views
	}

	get hasPointCloud(){
		//readonly attribute boolean hasPointCloud;
		return false
	}

	get pointCloud(){
		//readonly attribute XRPointCloud? pointCloud;
		return null
	}

	get hasLightEstimate(){
		//readonly attribute boolean hasLightEstimate;
		return this._session.reality._getHasLightEstimate();
	}

	get lightEstimate(){
		//readonly attribute XRLightEstimate? lightEstimate;
		return this._session.reality._getLightAmbientIntensity();
	}

	/*
	Returns an array of known XRAnchor instances. May be empty.
	*/
	get anchors(){
		//readonly attribute sequence<XRAnchor> anchors;
		let results = []
		for(let value of this._session.reality._anchors.values()){
			results.push(value)
		}
		return results
	}

	/**
	 * Return a new mid-air anchor with the current device pose
	 */
	createMidAirAnchor() {
		return this._session.reality._createMidAirAnchor()
	}

	/**
	 * Return a new anchor at the given hit position
	 */
	createAnchorFromHit(hit) {
		return this._session.reality._createAnchorFromHit(hit)
	}
	

	/**
	 * Perform a hit test (synchronously), returning an array of XRHit objects
	 */
	hitTest(normalizedScreenX, normalizedScreenY) {
		// Array<XRHit> hitTest(float32, float32);
		return this._session.reality._hitTest(normalizedScreenX, normalizedScreenY)
	}

	getDevicePose(frameOfReference){
		// XRDevicePose? getDevicePose(XRFrameOfReference frameOfReference);
		const poseModelMatrix = this._session._device._pose.getTransformTo(frameOfReference)
		const devicePose = poseModelMatrix ? new XRDevicePose(poseModelMatrix) : null
		
		// compute view.viewMatrix property for backwards compatability
		if (devicePose) {
			for (let view of this.views) {
				view._viewMatrix = devicePose.getViewMatrix(view)
			}
		}

		return devicePose
	}

	/*****************************************************************************************************
	 *  The following methods are for backwards compatability, and may be removed in a future polyfill release
	 *****************************************************************************************************/ 

	findAnchor(normalizedScreenX, normalizedScreenY) {
		return this._session.reality._requestHitTest(normalizedScreenX, normalizedScreenY).then((hits)=>{
			if (hits.length === 0) return null
			const hit = hits[0]
			if (!hit.target) {
				const dummyAnchor = new XRAnchor()
				dummyAnchor._transform = hit._transform
				this._session.reality._anchors.set(dummyAnchor.uid, dummyAnchor)
				hit._target = dummyAnchor
			}
			return new XRAnchorOffset(hit)
		})
	}

	hitTestNoAnchor(normalizedScreenX, normalizedScreenY) {
		const hits = this._session.reality._hitTest(normalizedScreenX, normalizedScreenY, XRHit.HINT_HORIZONTAL_PLANE)
		if (hits.length === 0) return null
		const hit = hits[0]
		if (!hit.target) {
			const dummyAnchor = new XRAnchor()
			dummyAnchor._transform = hit._transform
			this._session.reality._anchors.set(dummyAnchor.uid, dummyAnchor)
			hit._target = dummyAnchor
		}
		return new XRAnchorOffset(hit)
	}

	// deprecated
	findFloorAnchor(uid) {
		return this.session._reality._requestFloorAnchor(uid).then((anchor)=>{
			return new XRAnchorOffset(anchor)
		})
	}

	getAnchor(uid){
		// XRAnchor? getAnchor(DOMString uid);
		if (uid._hit) return uid._hit // for XRAnchorOffset
		return this._session.reality._getAnchor(uid)
	}

	// for backwards compatability, assumes 'eye-level' frame when given 'headModel' frame
	getCoordinateSystem(...types){
		for (var type of types) {
			if (type === 'headModel') type = 'eye-level'
			var frame = this._session._device._getFrameOfReference(type)
			if (frame) return frame
		}
	}
	
	// backwards compatability (replaced by getDevicePose)
	getDisplayPose(coordinateSystem) {
		return this.getDevicePose(coordinateSystem)
	}
}

// Backwards Compatability (replaced by XRHit)
export class XRAnchorOffset {
	constructor(hitOrUid) {
		const uid = hitOrUid.uid ? hitOrUid.uid : hitOrUid
		const hit = hitOrUid.uid ? hitOrUid : null
		this.anchorUID = new String(uid)
		this.anchorUID._hit = hit
	}

	// this is currently used as such: anchorOffset.getOffsetTransform(anchor.coordinateSystem)
	// in various projects that depend on this polyfill, however this method never allowed the user
	// to provide the frame of reference for the final transform, so we will just return 
	// the transform for the default coordinate system (ussually eye-level)
	getOffsetTransform(coordinateSystem) {
		return coordinateSystem._transform || MatrixMath.mat4_generateIdentity() // code that uses xranchoroffset can't handle undefined transform
	}
}