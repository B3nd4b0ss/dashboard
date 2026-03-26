import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import './Placeholder.css';

function renderPreview(preview) {
	if (preview === 'people') {
		return (
			<div className='placeholder-people'>
				{[
					['AL', 'Design Systems'],
					['KP', 'Delivery Lead'],
					['RM', 'Product Ops'],
				].map(([initials, role]) => (
					<div key={initials} className='placeholder-person'>
						<div className='placeholder-avatar'>{initials}</div>
						<div>
							<strong>{role}</strong>
							<p>Member card placeholder</p>
						</div>
					</div>
				))}
			</div>
		);
	}

	if (preview === 'settings') {
		return (
			<div className='placeholder-settings'>
				{[
					'Workspace defaults',
					'Notification rules',
					'Automation preferences',
				].map((label) => (
					<div key={label} className='placeholder-setting-row'>
						<div>
							<strong>{label}</strong>
							<p>Prepared control row</p>
						</div>
						<span className='placeholder-toggle' />
					</div>
				))}
			</div>
		);
	}

	if (preview === 'stack') {
		return (
			<div className='placeholder-stack'>
				{['Runtimes', 'Automation', 'Infrastructure'].map((item) => (
					<div key={item} className='placeholder-stack-card'>
						<strong>{item}</strong>
						<p>Future operations module</p>
					</div>
				))}
			</div>
		);
	}

	return (
		<div className='placeholder-board'>
			{['Backlog', 'Doing', 'Review'].map((column) => (
				<div key={column} className='placeholder-column'>
					<div className='placeholder-column-head'>
						<strong>{column}</strong>
						<span>2</span>
					</div>
					<div className='placeholder-ticket'>
						<span className='mini-badge'>Seeded</span>
						<strong>{column} task card</strong>
						<p>Placeholder for future task data.</p>
					</div>
					<div className='placeholder-ticket muted'>
						<strong>Secondary item</strong>
						<p>Ready for linked project context.</p>
					</div>
				</div>
			))}
		</div>
	);
}

function Placeholder({
	title,
	eyebrow = 'Coming Next',
	description,
	icon: Icon,
	highlights = [],
	preview = 'board',
}) {
	return (
		<div className='placeholder-page'>
			<section className='placeholder-hero'>
				<div className='placeholder-copy'>
					<div className='placeholder-icon'>
						{Icon ? <Icon /> : null}
					</div>
					<span className='section-tag'>{eyebrow}</span>
					<h2>{title}</h2>
					<p>{description}</p>
				</div>
				<div className='placeholder-card'>
					<div className='placeholder-card-head'>
						<strong>Prepared surface</strong>
						<ArrowForwardRounded fontSize='small' />
					</div>
					<p>
						This page is intentionally styled now so you can wire
						real data and interaction flows into it next without
						redesigning the shell.
					</p>
				</div>
			</section>

			<section className='placeholder-highlights'>
				{highlights.map((item) => (
					<article key={item} className='placeholder-highlight'>
						<CheckCircleRounded fontSize='small' />
						<span>{item}</span>
					</article>
				))}
			</section>

			<section className='placeholder-preview-card'>
				<div className='panel-header'>
					<span className='section-tag muted'>Preview Layout</span>
					<h3>Styled placeholder module</h3>
					<p>
						The visual language is already in place, so you can move
						from placeholder to fully interactive workspace later.
					</p>
				</div>
				{renderPreview(preview)}
			</section>
		</div>
	);
}

export default Placeholder;
