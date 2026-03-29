const express = require('express');
const { openFolderPicker } = require('../services/folderPickerService');
const {
	getPublicSettings,
	updateSettings,
} = require('../services/settingsService');

const router = express.Router();

router.get('/settings', async (req, res) => {
	try {
		res.json(getPublicSettings());
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

router.patch('/settings', async (req, res) => {
	try {
		const settings = updateSettings(req.body || {});
		res.json(settings);
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

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

module.exports = router;
