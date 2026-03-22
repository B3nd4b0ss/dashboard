import './Placeholder.css';
function Placeholder({ title }) {
	return (
		<div className='placeholder'>
			<h2>{title}</h2>
			<p>
				This section is coming soon. You can extend the backend and
				frontend to add full functionality.
			</p>
		</div>
	);
}

export default Placeholder;
