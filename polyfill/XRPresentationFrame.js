import XRAnchor from './XRAnchor.js'
import MatrixMath from './fill/MatrixMath.js'
import XRDevicePose from './XRDevicePose.js';

/*
XRPresentationFrame provides all of the values needed to render a single frame of an XR scene to the XRDisplay.
*/
export default class XRPresentationFrame {
	constructor(session){
		this._session = session
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
	createMidAirAnchor(positionOffset) {
		const anchor = new XRAnchor
		anchor._transform = this._session._device._pose._transform
		this._session.reality._addAnchor(anchor)
		return anchor
	}

	/**
	 * Perform a hit test (synchronously), returning an array of XRHit objects
	 */
	hitTest(normalizedScreenX, normalizedScreenY) {
		// Array<XRHit> hitTest(float32, float32);
		return this._session.reality._hitTest(normalizedScreenX, normalizedScreenY)
	}

	getDevicePose(coordinateSystem){
		// XRDevicePose? getDevicePose(XRCoordinateSystem coordinateSystem);
		const poseModelMatrix = this._session._device._pose.getTransformTo(coordinateSystem)
		return poseModelMatrix ? new XRDevicePose(poseModelMatrix) : null
	}
}