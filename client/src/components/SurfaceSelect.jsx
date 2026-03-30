import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import './SurfaceSelect.css';

/**
 * Builds the normalized search text used to filter surface options.
 *
 * @param {object} option - Surface option metadata.
 * @returns {string} Lower-case searchable text blob.
 */
function getOptionSearchText(option) {
	const keywordList = Array.isArray(option.keywords)
		? option.keywords
		: [option.keywords];

	return [
		option.label,
		option.description,
		option.value,
		option.searchText,
		...keywordList,
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

/**
 * Renders a searchable selection surface used for choosing templates or other option sets.
 *
 * @param {{options: object[], value: string, onChange: (value: string) => void, label?: string, helperText?: string, placeholder?: string, emptyMessage?: string}} props - Component props.
 * @returns {JSX.Element} Searchable option picker.
 */
function SurfaceSelect({
	value,
	onChange,
	options,
	placeholder = 'Select an option',
	variant = 'default',
	align = 'left',
	className = '',
	disabled = false,
	searchable = false,
	searchPlaceholder = 'Search options',
	emptyMessage = 'No matching options found.',
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [menuDirection, setMenuDirection] = useState('down');
	const [menuMaxHeight, setMenuMaxHeight] = useState(null);
	const rootRef = useRef(null);
	const menuRef = useRef(null);
	const searchInputRef = useRef(null);
	const listboxId = useId();
	const selectedOption =
		options.find((option) => String(option.value) === String(value)) ||
		null;
	const normalizedQuery = query.trim().toLowerCase();
	const visibleOptions = normalizedQuery
		? options.filter((option) =>
				getOptionSearchText(option).includes(normalizedQuery),
			)
		: options;

	useEffect(() => {
		if (disabled) {
			setOpen(false);
		}
	}, [disabled]);

	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const handlePointerDown = (event) => {
			if (!rootRef.current?.contains(event.target)) {
				setOpen(false);
			}
		};

		const handleEscape = (event) => {
			if (event.key === 'Escape') {
				setOpen(false);
			}
		};

		document.addEventListener('mousedown', handlePointerDown);
		document.addEventListener('keydown', handleEscape);

		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [open]);

	useEffect(() => {
		if (!open) {
			setQuery('');
			return undefined;
		}

		if (!searchable) {
			return undefined;
		}

		const frameId = window.requestAnimationFrame(() => {
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		});

		return () => window.cancelAnimationFrame(frameId);
	}, [open, searchable]);

	useLayoutEffect(() => {
		if (!open) {
			setMenuDirection('down');
			setMenuMaxHeight(null);
			return undefined;
		}

		const updateMenuPlacement = () => {
			const rootElement = rootRef.current;
			const menuElement = menuRef.current;

			if (!rootElement || !menuElement) {
				return;
			}

			const viewportPadding = 16;
			const menuGap = 10;
			const rootRect = rootElement.getBoundingClientRect();
			const availableBelow =
				window.innerHeight -
				rootRect.bottom -
				viewportPadding -
				menuGap;
			const availableAbove = rootRect.top - viewportPadding - menuGap;
			const preferredMenuHeight = Math.min(menuElement.scrollHeight, 320);
			const shouldOpenUp =
				preferredMenuHeight > availableBelow &&
				availableAbove > availableBelow;
			const nextDirection = shouldOpenUp ? 'up' : 'down';
			const availableSpace = shouldOpenUp
				? availableAbove
				: availableBelow;

			setMenuDirection(nextDirection);
			setMenuMaxHeight(
				Math.max(0, Math.min(320, Math.floor(availableSpace))),
			);
		};

		updateMenuPlacement();

		const handleViewportChange = () => {
			window.requestAnimationFrame(updateMenuPlacement);
		};

		window.addEventListener('resize', handleViewportChange);
		document.addEventListener('scroll', handleViewportChange, true);

		return () => {
			window.removeEventListener('resize', handleViewportChange);
			document.removeEventListener('scroll', handleViewportChange, true);
		};
	}, [open, searchable, query, visibleOptions.length]);

	return (
		<div
			ref={rootRef}
			className={`surface-select ${variant} ${align} ${
				open ? 'open' : ''
			} ${menuDirection === 'up' ? 'opens-up' : 'opens-down'} ${className}`.trim()}>
			<button
				type='button'
				className='surface-select-trigger'
				disabled={disabled}
				aria-expanded={open}
				aria-haspopup='listbox'
				aria-controls={listboxId}
				onClick={() => setOpen((previous) => !previous)}>
				<div className='surface-select-copy'>
					<strong>{selectedOption?.label || placeholder}</strong>
					{selectedOption?.description && variant === 'default' && (
						<span>{selectedOption.description}</span>
					)}
				</div>
				<KeyboardArrowDownRounded fontSize='small' />
			</button>

			{open && (
				<div
					ref={menuRef}
					id={listboxId}
					className='surface-select-menu'
					style={
						menuMaxHeight !== null
							? { maxHeight: `${menuMaxHeight}px` }
							: undefined
					}
					role='listbox'>
					{searchable && (
						<label className='surface-select-search'>
							<SearchRounded fontSize='small' />
							<input
								ref={searchInputRef}
								type='text'
								value={query}
								onChange={(event) =>
									setQuery(event.target.value)
								}
								onKeyDown={(event) => event.stopPropagation()}
								placeholder={searchPlaceholder}
								className='surface-select-search-input'
							/>
						</label>
					)}

					{visibleOptions.length === 0 && (
						<div className='surface-select-empty'>
							{emptyMessage}
						</div>
					)}

					{visibleOptions.map((option) => {
						const isSelected =
							String(option.value) ===
							String(selectedOption?.value ?? '');
						const isDisabled = Boolean(option.disabled);

						return (
							<button
								key={String(option.value)}
								type='button'
								role='option'
								aria-selected={isSelected}
								aria-disabled={isDisabled}
								className={`surface-select-option ${
									isSelected ? 'selected' : ''
								} ${isDisabled ? 'disabled' : ''}`.trim()}
								disabled={isDisabled}
								onMouseDown={(event) => {
									event.preventDefault();
								}}
								onClick={(event) => {
									if (isDisabled) {
										event.preventDefault();
										return;
									}

									event.stopPropagation();
									onChange(option.value);
									setQuery('');
									setOpen(false);
								}}>
								<div className='surface-select-option-copy'>
									<strong>{option.label}</strong>
									{option.description && (
										<span>{option.description}</span>
									)}
								</div>
								{isSelected && (
									<CheckRounded fontSize='small' />
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

export default SurfaceSelect;
