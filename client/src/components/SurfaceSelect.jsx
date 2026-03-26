import { useEffect, useId, useRef, useState } from 'react';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import './SurfaceSelect.css';

function SurfaceSelect({
	value,
	onChange,
	options,
	placeholder = 'Select an option',
	variant = 'default',
	align = 'left',
	className = '',
	disabled = false,
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef(null);
	const listboxId = useId();
	const selectedOption =
		options.find((option) => String(option.value) === String(value)) ||
		null;

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

	return (
		<div
			ref={rootRef}
			className={`surface-select ${variant} ${align} ${
				open ? 'open' : ''
			} ${className}`.trim()}>
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
					id={listboxId}
					className='surface-select-menu'
					role='listbox'>
					{options.map((option) => {
						const isSelected =
							String(option.value) ===
							String(selectedOption?.value ?? '');

						return (
							<button
								key={String(option.value)}
								type='button'
								role='option'
								aria-selected={isSelected}
								className={`surface-select-option ${
									isSelected ? 'selected' : ''
								}`}
								onMouseDown={(event) => {
									event.preventDefault();
								}}
								onClick={(event) => {
									event.stopPropagation();
									onChange(option.value);
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
