import MatrixMath from './fill/MatrixMath.js'
import Quaternion from './fill/Quaternion.js'

/*
XRDevicePose describes the position and orientation of an XRDisplay relative to the query XRCoordinateSystem.
It also describes the view matrices that should be used by the application to render a frame of the XR scene.
*/
export default class XRDevicePose {
	constructor(poseModelMatrix){
		this.__transform = poseModelMatrix
	}

	get poseModelMatrix(){ return this.__transform }

	getViewMatrix(view){
		if (view._eyeDisplacementMatrix) {
			const transform = MatrixMath.mat4_multiply(new Float32Array(16), this.__transform, view._eyeDisplacementMatrix)
			return MatrixMath.mat4_invert(transform, transform)
		} else {
			return MatrixMath.mat4_invert(new Float32Array(16), this.__transform)
		}
	}

	get _position(){
		if (!this.__transform) return null
		return [this.__transform[12], this.__transform[13], this.__transform[14]]
	}

	get _orientation(){
		if (!this.__transform) return null
		let quat = new Quaternion()
		quat.setFromRotationMatrix(this.__transform)
		return quat.toArray()
	}
}

XRDevicePose.SITTING_EYE_HEIGHT = 1.1 // meters
