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

XRFrameOfReference.HEAD_MODEL = 'headModel'
XRFrameOfReference.EYE_LEVEL = 'eyeLevel'
XRFrameOfReference.STAGE = 'stage'