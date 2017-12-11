
const options  = new Object;
const loriform = document.forms['loriform'];
const applymsg = document.getElementById('applymsg');
const defaults = { // default options
	'Realtime Loader': true,
	'CSS3 Animation' : true,
	'Delay Open Preview': 0,
	'Delay Close Preview': 800,
	'Desktop Notification': true
}
var delay = null;

chrome.storage.sync.get(defaults, setValues);
chrome.storage.onChanged.addListener(items => {
	for (let name in items) {
		loriform.elements[name][
			loriform.elements[name].type === 'checkbox'
			? 'checked'
			: 'value'] = (
				options[name] = items[name].newValue
			);
	}
});

applymsg.addEventListener('animationend', () => applymsg.classList.remove('apply-anim'));
loriform.onchange = onValueChange;
loriform.addEventListener('input', evt => {
	clearTimeout(delay);
	delay = setTimeout(() => {
		loriform.onchange = () => { loriform.onchange = onValueChange };
		onValueChange(evt);
	}, 750);
});
loriform.elements['resetSettings'].addEventListener('click', () => {
	chrome.storage.sync.set(defaults, () => applymsg.classList.add('apply-anim'));
	setValues(defaults);
});

function onValueChange({ target }) {
	clearTimeout(delay);
	switch (target.type) {
		case 'checkbox':
			options[target.id] = target.checked;
			break;
		case 'number':
			options[target.id] = target.valueAsNumber >= 0 ? target.valueAsNumber : (target.value = 0);
	}
	chrome.storage.sync.set(options, () => applymsg.classList.add('apply-anim'));
}

function setValues(items) {
	for (let name in items) {
		loriform.elements[name][
			loriform.elements[name].type === 'checkbox'
			? 'checked'
			: 'value'] = (
				options[name] = items[name]
			);
	}
}
