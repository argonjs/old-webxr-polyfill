import XRTracker from '../XRTracker.js'
import XRAnchor from '../XRAnchor.js'

const LICENSE_KEY_MISSING_ERROR = 
`An encrypted license key is required in order to use the Vuforia extension. 
You can get a Vuforia license key from https://developer.vuforia.com/
Then, encrypt your key with the tool at http://docs.argonjs.io/start/vuforia-pgp-encryptor, 
and provide the encrypted license key to the init() method`;

export default class ArgonVuforiaTracker extends XRTracker {

    static _requestTracker(reality, options) {
		const encryptedLicenseData = options.encryptedLicenseData
        if (!encryptedLicenseData || typeof encryptedLicenseData !== 'string') 
			throw new Error(LICENSE_KEY_MISSING_ERROR)
		
		if (!window.ARGON_BROWSER && window.ARGON_BROWSER.xr === true) 
			throw new Error('ArgonXR browser is required to use the Vuforia tracker')

        return reality._device._argonWrapper._request('vuforia.init', {encryptedLicenseData}).then(() => {
			return new ArgonVuforiaTracker(reality)
		});
	}

	constructor(reality) {
		super()
		this._reality = reality
		this._argonWrapper = reality._device._argonWrapper

		this._argonWrapper._messageHandlers['vuforia.objectTrackerLoadDataSetEvent'] = (evt)=>{
			console.log(`Vuforia loaded DataSet ${JSON.stringify(evt)}`)
		}

		this._argonWrapper._messageHandlers['vuforia.objectTrackerActivateDataSetEvent'] = (evt)=>{
			console.log(`Vuforia activated DataSet ${JSON.stringify(evt)}`)
		}
	}

	/**
	 * @param {number} value 
	 * @returns {Promise<boolean>}
	 */
    setMaxSimultaneousImageTargetsHint(value) {
        let options = {hint:VuforiaHintMaxSimultaneousImageTargets, value};
        return this._argonWrapper._request('vuforia.setHint', options).then((message) => {
            return message.result;
        })
    }

	/**
	 * @param {number} value 
	 * @returns {Promise<boolean>}
	 */
    setMaxSimultaneousObjectTargetsHint(value) {
        let options = {hint:VuforiaHintMaxSimultaneousObjectTargets, value};
        return this._argonWrapper._request('vuforia.setHint', options).then((message) => {
            return message.result;
        })
	}
	
	/**
	 * Fetch a dataset from the provided url. 
	 * If successfull, resolves to an id which represents the dataset. 
	 */
	fetchDataSet(url) {
		url = resolveURL(url)
		return this._argonWrapper._request('vuforia.objectTrackerCreateDataSet', { url })
			.then((message) => {
				return message.id;
			});
	}

	/**
	 * Load the dataset into memory, and return a promise which
	 * resolves to an array of the contained trackables
	 */
	loadDataSet(id) {
		return this._argonWrapper._request('vuforia.objectTrackerLoadDataSet', { id }).then((trackables)=>{
            const trackablesMap = new Map
            for (const name in trackables) {
				const trackable = trackables[name]
				const anchor = new ArgonVuforiaTrackableAnchor(trackable.id)
				anchor._isTrackable = true
				anchor._name = name
				anchor._size = trackable.size
				this._reality._anchors.set(trackable.id, anchor)
				trackablesMap.set(name, anchor)
            }
			return trackablesMap
        });
	}

	/**
	 * Unload a dataset from memory (deactivating it if necessary)
	 */
	unloadDataSet(id) {
		this._argonWrapper._request('vuforia.objectTrackerUnloadDataSet', { id });
	}

	/**
	 * Load (if necessary) and activate a dataset to enable tracking of the contained trackables
	 */
	activateDataSet(id) {
		return this._argonWrapper._request('vuforia.objectTrackerActivateDataSet', { id });
	}

	/**
	 * Deactivate a loaded dataset to disable tracking of the contained trackables
	 */
	deactivateDataSet(id) {
		return this._argonWrapper._request('vuforia.objectTrackerDeactivateDataSet', { id });
	}

}

const VuforiaHintMaxSimultaneousImageTargets = 0
const VuforiaHintMaxSimultaneousObjectTargets = 1
const VuforiaHintDelayedLoadingObjectDatasets = 2


class ArgonVuforiaTrackableAnchor extends XRAnchor {
	constructor(uid) {
		super(uid)
		this._name = null 
		this._size = null // {x:number, y:number, z:number}
	}

	get name() {
		return this._name
	}

	get size() {
		return this._size
	}
}


// class VuforiaObjectTracker extends EventHandlerBase {

// 	constructor(ext) {
//         super()
// 		this._argonWrapper = ext._argonWrapper

// 		// this._argonWrapper._messageHandlers.on['vuforia.objectTrackerLoadDataSetEvent'] = (message) => {
// 		// 	this.dispatchEvent(new CustomEvent('datasetloaded', {detail:message}))
//         // }

//         // this._argonWrapper._messageHandlers.on['vuforia.objectTrackerUnloadDataSetEvent'] = (message) => {
// 		// 	this.dispatchEvent(new CustomEvent('datasetunloaded', {detail:message}))
//         // }

//         // this._argonWrapper._messageHandlers.on['vuforia.objectTrackerActivateDataSetEvent'] = (message) => {
// 		// 	this.dispatchEvent(new CustomEvent('datasetactivated', {detail:message}))
//         // }

//         // this._argonWrapper._messageHandlers.on['vuforia.objectTrackerDeactivateDataSetEvent'] = (message) => {
// 		// 	this.dispatchEvent(new CustomEvent('datasetdeactivated', {detail:message}))
// 		// }
// 	}

// }


const urlParser = document.createElement("a")

function resolveURL(inURL) {
    if (!urlParser) throw new Error("resolveURL requires DOM api");
    if (inURL === undefined) throw new Error('Expected inURL')
    urlParser.href = '';
    urlParser.href = inURL
    return urlParser.href
}