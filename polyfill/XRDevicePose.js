import MatrixMath from './fill/MatrixMath.js'
import Quaternion from './fill/Quaternion.js'

/*
XRDevicePose describes the position and orientation of an XRDisplay relative to the query XRCoordinateSystem.
It also describes the view matrices that should be used by the application to render a frame of the XR scene.
*/
export default class XRDevicePose {
	constructor(poseModelMatrix){
		this._poseModelMatrix = poseModelMatrix
	}

	get poseModelMatrix(){ return this._poseModelMatrix }

	getViewMatrix(view){
		if (view._viewMatrix) return view._viewMatrix
		const out = new Float32Array(16)
		MatrixMath.mat4_eyeView(out, this._poseModelMatrix) // TODO offsets from view
		return out
	}
}

XRDevicePose.SITTING_EYE_HEIGHT = 1.1 // meters
