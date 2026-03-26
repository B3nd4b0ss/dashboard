const {
	loadMembers,
	loadTasks,
	saveMembers,
} = require('../utils/fileOperations');
const { generateId } = require('../utils/helpers');
const { unassignTasksForMember } = require('./taskService');

const MEMBER_ACCENTS = ['blue', 'green', 'amber', 'slate'];

function normalizeOptionalText(value) {
	if (value === null || typeof value === 'undefined') {
		return null;
	}

	const trimmed = String(value).trim();
	return trimmed || null;
}

function normalizeEmail(value) {
	const normalizedEmail = normalizeOptionalText(value);

	if (!normalizedEmail) {
		return null;
	}

	const loweredEmail = normalizedEmail.toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loweredEmail)) {
		throw new Error('Email address is invalid');
	}

	return loweredEmail;
}

function getMemberTaskSummary(memberId, tasks = loadTasks()) {
	const memberTasks = tasks.filter((task) => task.assigneeId === memberId);
	const projectNames = [
		...new Set(memberTasks.map((task) => task.projectName).filter(Boolean)),
	];

	return {
		total: memberTasks.length,
		completed: memberTasks.filter((task) => task.status === 'done').length,
		active: memberTasks.filter((task) => task.status !== 'done').length,
		projects: projectNames,
	};
}

function decorateMember(member, tasks = loadTasks()) {
	const taskSummary = getMemberTaskSummary(member.id, tasks);

	return {
		...member,
		taskSummary,
	};
}

function getAllMembers() {
	const tasks = loadTasks();
	return loadMembers()
		.map((member) => decorateMember(member, tasks))
		.sort((left, right) => left.name.localeCompare(right.name));
}

function getMemberById(id) {
	const member = loadMembers().find((entry) => entry.id === id);
	return member ? decorateMember(member) : null;
}

function createMember(data) {
	const name = normalizeOptionalText(data.name);
	if (!name) {
		throw new Error('Member name required');
	}

	const members = loadMembers();
	const email = normalizeEmail(data.email);

	if (
		email &&
		members.some(
			(member) => member.email?.toLowerCase() === email.toLowerCase(),
		)
	) {
		throw new Error('Email already exists');
	}

	const member = {
		id: generateId(),
		name,
		role: normalizeOptionalText(data.role) || 'Contributor',
		email,
		accent:
			normalizeOptionalText(data.accent) ||
			MEMBER_ACCENTS[members.length % MEMBER_ACCENTS.length],
		createdAt: new Date().toISOString(),
	};

	members.push(member);
	saveMembers(members);
	return decorateMember(member);
}

function updateMember(id, updates) {
	const members = loadMembers();
	const memberIndex = members.findIndex((entry) => entry.id === id);

	if (memberIndex === -1) {
		throw new Error('Member not found');
	}

	const member = members[memberIndex];

	if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
		const name = normalizeOptionalText(updates.name);
		if (!name) {
			throw new Error('Member name required');
		}

		member.name = name;
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'role')) {
		member.role = normalizeOptionalText(updates.role) || 'Contributor';
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
		const email = normalizeEmail(updates.email);
		if (
			email &&
			members.some(
				(entry) =>
					entry.id !== member.id &&
					entry.email?.toLowerCase() === email.toLowerCase(),
			)
		) {
			throw new Error('Email already exists');
		}

		member.email = email;
	}

	if (Object.prototype.hasOwnProperty.call(updates, 'accent')) {
		member.accent =
			normalizeOptionalText(updates.accent) ||
			MEMBER_ACCENTS[memberIndex % MEMBER_ACCENTS.length];
	}

	members[memberIndex] = member;
	saveMembers(members);
	return decorateMember(member);
}

function deleteMember(id) {
	const members = loadMembers();
	const memberIndex = members.findIndex((entry) => entry.id === id);

	if (memberIndex === -1) {
		return false;
	}

	members.splice(memberIndex, 1);
	saveMembers(members);
	unassignTasksForMember(id);
	return true;
}

module.exports = {
	MEMBER_ACCENTS,
	getMemberTaskSummary,
	getAllMembers,
	getMemberById,
	createMember,
	updateMember,
	deleteMember,
};
