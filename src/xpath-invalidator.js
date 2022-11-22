import { getBucketsForNode } from 'fontoxpath';

/**
 * A DomFacade that will catch all access to nodes. If a muation record with a target that is in the 'touchedNodes' array comes by, it may change the result of the query.
 */
class DependencyNotifyingDomFacade {
	/**
	 * @param  onNodeTouched - onNodeTouched A function what will be executed whenever a node is 'touched' by the XPath
	 */
	constructor(onNodeTouched) {
		this._onNodeTouched = onNodeTouched;
	}

	/**
	 * Get all attributes of this element.
	 * The bucket can be used to narrow down which attributes should be retrieved.
	 *
	 * @param  node -
	 */
	getAllAttributes(node) {
		this._onNodeTouched(node);
		return Array.from(node.attributes);
	}

	/**
	 * Get the value of specified attribute of this element.
	 *
	 * @param  node -
	 * @param  attributeName -
	 */
	getAttribute(node, attributeName) {
		this._onNodeTouched(node);
		return node.getAttribute(attributeName);
	}

	/**
	 * Get all child nodes of this element.
	 * The bucket can be used to narrow down which child nodes should be retrieved.
	 *
	 * @param  node -
	 * @param  bucket - The bucket that matches the attribute that will be used.
	 */
	getChildNodes(node, bucket) {
		this._onNodeTouched(node);
		const matchingNodes = Array.from(node.childNodes).filter(
			childNode => !bucket || getBucketsForNode(childNode).includes(bucket),
		);
		return matchingNodes;
	}

	/**
	 * Get the data of this node.
	 *
	 * @param  node -
	 */
	getData(node) {
		this._onNodeTouched(node);
		if (node.nodeType === Node.ATTRIBUTE_NODE) {
			return node.value;
		}
		// Text node
		return node.data;
	}

	/**
	 * Get the first child of this element.
	 * An implementation of IDomFacade is free to interpret the bucket to skip returning nodes that do not match the bucket, or use this information to its advantage.
	 *
	 * @param  node -
	 * @param  bucket - The bucket that matches the attribute that will be used.
	 */
	getFirstChild(node, bucket) {
		this._onNodeTouched(node);
		for (const child of node.childNodes) {
			if (!bucket || getBucketsForNode(child).includes(bucket)) {
				return child;
			}
		}
		return null;
	}

	/**
	 * Get the last child of this element.
	 * An implementation of IDomFacade is free to interpret the bucket to skip returning nodes that do not match the bucket, or use this information to its advantage.
	 *
	 * @param  node -
	 * @param  bucket - The bucket that matches the attribute that will be used.
	 */
	getLastChild(node, bucket) {
		this._onNodeTouched(node);
		const matchingNodes = node
			  .getChildNodes()
			  .filter(childNode => !bucket || getBucketsForNode(childNode).includes(bucket));
		const matchNode = matchingNodes[matchingNodes.length - 1];
		if (matchNode) {
			return matchNode;
		}
		return null;
	}

	/**
	 * Get the next sibling of this node
	 * An implementation of IDomFacade is free to interpret the bucket to skip returning nodes that do not match the bucket, or use this information to its advantage.
	 *
	 * @param  node -
	 * @param  bucket - The bucket that matches the nextSibling that is requested.
	 */
	getNextSibling(node, bucket) {
		if (node.parentNode) {
			this._onNodeTouched(node.parentNode);
		}
		for (let sibling = node.nextSibling; sibling; sibling = sibling.nextSibling) {
			if (bucket && !getBucketsForNode(sibling).includes(bucket)) {
				// eslint-disable-next-line no-continue
				continue;
			}
			return sibling;
		}
		return null;
	}

	/**
	 * Get the parent of this element.
	 * An implementation of IDomFacade is free to interpret the bucket to skip returning nodes that do not match the bucket, or use this information to its advantage.
	 *
	 * @param  node -
	 * @param  bucket - The bucket that matches the attribute that will be used.
	 */
	getParentNode(node) {
		if (node.parentNode){
			this._onNodeTouched(node.parentNode);
		}
		return node.parentNode;
	}

	/**
	 * Get the previous sibling of this element.
	 * An implementation of IDomFacade is free to interpret the bucket to skip returning nodes that do not match the bucket, or use this information to its advantage.
	 *
	 * @param  node -
	 * @param  bucket - The bucket that matches the attribute that will be used.
	 */
	getPreviousSibling(node, bucket) {
		if (node.parentNode){
			this._onNodeTouched(node.parentNode);
		}
		for (
			let { previousSibling } = node;
			previousSibling;
			previousSibling = previousSibling.previousSibling
		) {
			if (!getBucketsForNode(previousSibling).includes(bucket)) {
				// eslint-disable-next-line no-continue
				continue;
			}

			return previousSibling;
		}
		return null;
	}
}

function getOrDefault (map, key) {
	if (map.has(key)) {
		return map.get(key);
	}
	const def = new Set();
	map.set(key, def);
	return def;
}

class XPathInvalidator {
	_dependentComponentsByNode = new WeakMap();
	_dependenciesByComponent = new WeakMap();

	_queuedMutationRecords = []
	_mutationObserver = new MutationObserver((records) => {
		for (const record of records) {
			this._queuedMutationRecords.push(record);
		}
	});

	_currentDomFacade = null;

	/**
	 * Start observing an instance
	 *
	 * @param  {Element}  instanceRoot  The root element of the instance
	 */
	observeInstance (instanceRoot) {
		if (!('nodeType' in instanceRoot)) {
			return;
		}
		if (instanceRoot.nodeType === instanceRoot.DOCUMENT_NODE) {
			instanceRoot = instanceRoot.documentElement;
		}
		this._mutationObserver.observe(instanceRoot, {childList: true, attributes: true, data: true, subtree: true});
	}

	/**
	 * Get the invalidated web components based on the passed mutation records. These need to be updated
	 * later on.
	 *
	 * Will also clear all invalidated components awaiting their recomputation
	 */
	getInvalidatedComponents () {
		const mutationRecords = this._queuedMutationRecords.concat(this._mutationObserver.takeRecords());
		this._queuedMutationRecords = [];

		const components = [];
		for (const record of mutationRecords) {
			if (!this._dependentComponentsByNode.has(record.target)){
				continue;
			}

			components.push(...this._dependentComponentsByNode.get(record.target));
		}

		for (const dependentComponent of components) {
			this.removeComponent(dependentComponent);
		}

		return components;
	}

	get currentDomFacade () {
		if (!this._currentDomFacade) {
			console.warn('XPath outside of dependency tracking!');
			return null;
		}
		return this._currentDomFacade;
	}

	runInInvalidationContext (component, callback) {
		const touchedNodes = new Set();
		this._currentDomFacade = new DependencyNotifyingDomFacade((node) => {
			touchedNodes.add(node);
		});

		callback();

		const otherDependencies = getOrDefault(this._dependenciesByComponent, component);
		for (const touchedNode of touchedNodes) {
			const otherComponents = getOrDefault(this._dependentComponentsByNode, touchedNode);
			otherComponents.add(component);
			otherDependencies.add(touchedNode);
		}
		this._currentDomFacade = null;
	}

	/**
	 * Remove the component from the invalidation contexts
	 */
	removeComponent (component) {
		for (const dependency of this._dependenciesByComponent.get(component)) {
			const siblingComponents = this._dependentComponentsByNode.get(dependency);
			siblingComponents.delete(component);
		}
		this._dependenciesByComponent.delete(component);
	}
}

export default new XPathInvalidator();
