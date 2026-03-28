const express = require('express');
const { openFolderPicker } = require('../services/folderPickerService');

const router = express.Router();

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
