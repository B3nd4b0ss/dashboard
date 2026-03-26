const express = require('express');
const router = express.Router();
const memberService = require('../services/memberService');

router.get('/', (req, res) => {
	const members = memberService.getAllMembers();
	res.json(members);
});

router.get('/:id', (req, res) => {
	const member = memberService.getMemberById(req.params.id);
	if (!member) {
		return res.status(404).json({ error: 'Member not found' });
	}

	return res.json(member);
});

router.post('/', (req, res) => {
	try {
		const member = memberService.createMember(req.body);
		res.json(member);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

router.patch('/:id', (req, res) => {
	try {
		const member = memberService.updateMember(req.params.id, req.body);
		res.json(member);
	} catch (err) {
		const statusCode = err.message === 'Member not found' ? 404 : 400;
		res.status(statusCode).json({ error: err.message });
	}
});

router.delete('/:id', (req, res) => {
	const deleted = memberService.deleteMember(req.params.id);
	if (!deleted) {
		return res.status(404).json({ error: 'Member not found' });
	}

	return res.json({ message: 'Member deleted' });
});

module.exports = router;
