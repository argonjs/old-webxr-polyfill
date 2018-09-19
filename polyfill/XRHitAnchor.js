import MatrixMath from './fill/MatrixMath.js'
import XRAnchor from './XRAnchor.js'

export default class XRHitAnchor extends XRAnchor {

    constructor(hit) {
        super()
        this._transform = hit._transform
        this._type = hit._type
        this._target = hit._target

        this._localTransform = null
        if (this._target && this._target.isTrackable) {
            this._localTransform = this.getTransformTo(this._target)
        }
    }

    get type() {
        return this._type
    }

    get target() {
        return this._target
    }

	get _transform() {
		if (this._target && this._localTransform) {
			this.__transform = MatrixMath.mat4_multiply(
				this.__transform || new Float32Array(16), 
                this._target._transform,
                this._localTransform
			)
		}
		return this.__transform
    }

    set _transform(value) {
        this._localTransform = null // setting a global transform removes the local transform
		if (this._checkValueNull(value)) return
		this.__transform.set(value)
    }

}