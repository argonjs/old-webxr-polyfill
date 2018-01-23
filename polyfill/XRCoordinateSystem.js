import MatrixMath from './fill/MatrixMath.js'
import EventHandlerBase from './fill/EventHandlerBase.js'

/*
XRCoordinateSystem represents a 3D coordinate system
*/
export default class XRCoordinateSystem extends EventHandlerBase {
	constructor(){
		super()
		this.__transform = null
	}

	getTransformTo(otherCoordinateSystem){
		if (otherCoordinateSystem === this) return MatrixMath.mat4_generateIdentity()

		const myTransform = this._transform
		const otherTransform = otherCoordinateSystem._transform
		if (!myTransform || !otherTransform) return null

		// apply the inverse of the other coordinate system transform
		const out = new Float32Array(16)
		let inverseOther = MatrixMath.mat4_invert(out, otherCoordinateSystem._transform)
		return MatrixMath.mat4_multiply(out, inverseOther, myTransform)
	}

	_checkValueNull(value) {
		if (!value) {
			this.__transform = null
			return true
		}
		if (!this.__transform) this.__transform = MatrixMath.mat4_generateIdentity()
		return false
	}

	get _transform(){ return this.__transform }

	set _transform(value){
		if (this._checkValueNull(value)) return
		this.__transform.set(value)
	}

	get _position(){
		if (!this.__transform) return null
		return [this.__transform[12], this.__transform[13], this.__transform[14]]
	}

	set _position(value) {
		if (this._checkValueNull(value)) return
		this.__transform[12] = value[0]
		this.__transform[13] = value[1]
		this.__transform[14] = value[2]
	}

	get _orientation(){
		if (!this.__transform) return null
		let quat = new Quaternion()
		quat.setFromRotationMatrix(this.__transform)
		return quat.toArray()
	}

	set _orientation(value) {
		if (this._checkValueNull(value)) return
		MatrixMath.mat4_fromRotationTranslation(this.__transform, value, this._position)
	}
}