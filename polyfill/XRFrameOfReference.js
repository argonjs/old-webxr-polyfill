import XRCoordinateSystem from './XRCoordinateSystem.js'

export default class XRFrameOfReference extends XRCoordinateSystem {
    constructor() {
        super()
        this._bounds = null
        this._emulatedHeight = 0
    }

    get bounds() {
        return this._bounds
    }

    get emulatedHeight() {
        return this._emulatedHeight
    }
}

XRFrameOfReference.HEAD_MODEL = 'head-model'
XRFrameOfReference.EYE_LEVEL = 'eye-level'
XRFrameOfReference.STAGE = 'stage'

// backwards compatability
XRCoordinateSystem.HEAD_MODEL = 'headModel'
XRCoordinateSystem.EYE_LEVEL = 'eyeLevel'
XRCoordinateSystem.STAGE = 'stage'

