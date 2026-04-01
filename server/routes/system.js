const express = require('express');
const { openFolderPicker } = require('../services/folderPickerService');
const {
	getPublicSettings,
	updateSettings,
} = require('../services/settingsService');
const { inspectPort } = require('../services/portRegistry');

const router = express.Router();

// `GET /system/settings`
// Returns the client-safe dashboard settings payload.
router.get('/settings', async (req, res) => {
	try {
		res.json(getPublicSettings());
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// `PATCH /system/settings`
// Body params: partial settings payload under `github`, such as `autoCreateRepo`, `owner`,
// `visibility`, `token`, or `clearToken`.
router.patch('/settings', async (req, res) => {
	try {
		const settings = updateSettings(req.body || {});
		res.json(settings);
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

// `POST /system/pick-folder`
// Body params: optional `initialPath` and `title` used by the native folder picker dialog.
router.post('/pick-folder', async (req, res) => {
	try {
		const result = await openFolderPicker({
			initialPath: req.body?.initialPath,
			title: req.body?.title,
		});
		res.json(result);
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

// `GET /system/ports/check`
// Query params: `port` is required. Optional params are `label` and `excludeProjectName`.
router.get('/ports/check', (req, res) => {
	try {
		const report = inspectPort(req.query.port, {
			label: req.query.label || 'Port',
			excludeProjectName: req.query.excludeProjectName || null,
		});
		res.json(report);
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

module.exports = router;
