import {DepGraph} from './dep_graph.js';
import {Fore} from './fore.js';
import './fx-instance.js';
import {ModelItem} from './modelitem.js';
import {evaluateXPath, evaluateXPathToBoolean} from './xpath-evaluation.js';
import {XPathUtil} from './xpath-util.js';

/**
 * @ts-check
 */
export class FxModel extends HTMLElement {
    static dataChanged = false;
    constructor() {
        super();
        // this.id = '';

        this.instances = [];
        this.modelItems = [];
        this.defaultContext = {};
        this.changed = [];

        // this.mainGraph = new DepGraph(false);
        this.inited = false;
        this.modelConstructed = false;
        this.attachShadow({mode: 'open'});
        this.computes = 0;
    }

    get formElement() {
        return this.parentElement;
    }

    connectedCallback() {
        // console.log('connectedCallback ', this);
        this.shadowRoot.innerHTML = `
            <slot></slot>
        `;

        this.addEventListener('model-construct-done', () => {
            this.modelConstructed = true;
            // console.log('model-construct-done fired ', this.modelConstructed);
            // console.log('model-construct-done fired ', e.detail.model.instances);
        }, {once: true});

        this.skipUpdate = false;
    }

    static lazyCreateModelItem(model, ref, node) {
        // console.log('lazyCreateModelItem ', node);

        let targetNode = {};
        if (node === null || node === undefined) return null;
        if (node.nodeType === node.TEXT_NODE) {
            // const parent = node.parentNode;
            // console.log('PARENT ', parent);
            targetNode = node.parentNode;
        } else {
            targetNode = node;
        }

        // const path = fx.evaluateXPath('path()',node);
        let path;
        if (node.nodeType) {
            path = XPathUtil.getPath(node);
        } else {
            path = null;
            targetNode = node;
        }
        // const path = XPathUtil.getPath(node);

        // ### intializing ModelItem with default values (as there is no <fx-bind> matching for given ref)
        const mi = new ModelItem(
            path,
            ref,
            Fore.READONLY_DEFAULT,
            Fore.RELEVANT_DEFAULT,
            Fore.REQUIRED_DEFAULT,
            Fore.CONSTRAINT_DEFAULT,
            Fore.TYPE_DEFAULT,
            targetNode,
            this,
        );

        // console.log('new ModelItem is instanceof ModelItem ', mi instanceof ModelItem);
        model.registerModelItem(mi);
        return mi;
    }

    /**
     * modelConstruct starts actual processing of the model by
     *
     * 1. loading instances if present or constructing one
     * 2. calling updateModel to run the model update cycle of rebuild, recalculate and revalidate
     *
     * @event model-construct-done is fired once all instances have be loaded or after generating instance
     *
     */
    async modelConstruct() {
        // console.log('### <<<<< dispatching model-construct >>>>>');
        // this.dispatchEvent(new CustomEvent('model-construct', { detail: this }));
        Fore.dispatch(this, 'model-construct', {model: this});

        // console.time('instance-loading');
        const instances = this.querySelectorAll('fx-instance');
        if (instances.length > 0) {
            console.group('init instances');
            const promises = [];
            instances.forEach(instance => {
                promises.push(instance.init());
            });

			// Wait until all the instances are built
			await Promise.all(promises);

            this.instances = Array.from(instances);
            // console.log('_modelConstruct this.instances ', this.instances);
			// Await until the model-construct-done event is handled off

            await Fore.dispatch(this, 'model-construct-done', {model: this});
            this.inited = true;
            this.updateModel();
            console.groupEnd();
        } else {
            // ### if there's no instance one will created
            await this.dispatchEvent(
                new CustomEvent('model-construct-done', {
                    composed: false,
                    bubbles: true,
                    detail: {model: this},
                }),
            );
        }
        // console.timeEnd('instance-loading');
        this.inited = true;
    }

    registerModelItem(modelItem) {
        // console.log('ModelItem registered ', modelItem);
        this.modelItems.push(modelItem);
    }

    /**
     * update action triggering the update cycle
     */
    updateModel() {
        // console.time('updateModel');
        this.rebuild();
        if (this.skipUpdate){
            console.info('%crecalculate/revalidate skipped - no bindings', 'font-style: italic; background: #90a4ae; color:lightgrey; padding:0.3rem 5rem 0.3rem 0.3rem;display:block;width:100%;');
            return;
        }
        this.recalculate();
        this.revalidate();
        // console.timeEnd('updateModel');
    }

    rebuild() {
        console.info('%crebuild', 'font-style: italic; background: #90a4ae; color:white; padding:0.3rem 5rem 0.3rem 0.3rem;display:block;width:100%;');
        this.mainGraph = new DepGraph(false); // do: should be moved down below binds.length check but causes errors in tests.
        this.modelItems = [];

        // trigger recursive initialization of the fx-bind elements
        const binds = this.querySelectorAll('fx-model > fx-bind');
        if (binds.length === 0) {
            // console.log('skipped model update');
            this.skipUpdate = true;
            return;
        }

        binds.forEach(bind => {
            bind.init(this);
        });

        console.log(`mainGraph`, this.mainGraph);
        // console.log(`rebuild mainGraph calc order`, this.mainGraph.overallOrder());

        // this.dispatchEvent(new CustomEvent('rebuild-done', {detail: {maingraph: this.mainGraph}}));
        Fore.dispatch(this,'rebuild-done',{maingraph:this.mainGraph});
        console.log(
            `rebuild finished with modelItems ${this.modelItems.length} item(s)`,
            this.modelItems,
        );
    }

    /**
     * recalculation of all modelItems. Uses dependency graph to determine order of computation.
     *
     * todo: use 'changed' flag on modelItems to determine subgraph for recalculation. Flag already exists but is not used.
     */
    recalculate() {
        console.info('%crecalculate', 'font-style: italic; background: #90a4ae; color:white; padding:0.3rem 5rem 0.3rem 0.3rem;display:block;width:100%;');

        if (!this.mainGraph) {
            return;
        }

        console.group('### recalculate');
        console.log('changed nodes ', this.changed);


        console.time('recalculate');
        this.computes = 0;

        this.subgraph = new DepGraph(false);
        if (this.changed.length !== 0) {
            // ### build the subgraph
            this.changed.forEach(modelItem => {
                this.subgraph.addNode(modelItem.path, modelItem.node);
                // const dependents = this.mainGraph.dependantsOf(modelItem.path, false);
                // this._addSubgraphDependencies(modelItem.path);
                if (this.mainGraph.hasNode(modelItem.path)) {
                    // const dependents = this.mainGraph.directDependantsOf(modelItem.path)

                    const all = this.mainGraph.dependantsOf(modelItem.path, false);
                    const dependents = all.reverse();
                    if (dependents.length !== 0) {
                        dependents.forEach(dep => {
                            // const subdep = this.mainGraph.dependentsOf(dep,false);
                            // subgraph.addDependency(dep, modelItem.path);
                            const val = this.mainGraph.getNodeData(dep);
                            this.subgraph.addNode(dep, val);
                            if (dep.includes(':')) {
                                const path = dep.substring(0, dep.indexOf(':'));
                                this.subgraph.addNode(path, val);

                                const deps = this.mainGraph.dependentsOf(modelItem.path, false);
                                // if we find the dep to be first in list of dependents we are dependent on ourselves not adding edge to modelItem.path
                                if (deps.indexOf(dep) !== 0) {
                                    this.subgraph.addDependency(dep, modelItem.path);
                                }
                            }
                            // subgraph.addDependency(dep,modelItem.path);
                        });
                    }
                }
            });

            // ### compute the subgraph
            const ordered = this.subgraph.overallOrder(false);
            ordered.forEach(path => {
                if (this.mainGraph.hasNode(path)) {
                    const node = this.mainGraph.getNodeData(path);
                    this.compute(node, path);
                }
            });
            const toRefresh = [...this.changed];
            this.formElement.toRefresh = toRefresh;
            this.changed = [];
            console.log('subgraph', this.subgraph);
            this.dispatchEvent(
                new CustomEvent('recalculate-done', {detail: {subgraph: this.subgraph}}),
            );
        } else {
            const v = this.mainGraph.overallOrder(false);
            v.forEach(path => {
                const node = this.mainGraph.getNodeData(path);
                this.compute(node, path);
            });
        }
        console.log(`recalculated ${this.computes} modelItems`);

        console.timeEnd('recalculate');
        console.log('recalculate finished with modelItems ', this.modelItems);
        console.groupEnd();
    }

    /*
      _addSubgraphDependencies(path){
          const dependents = this.mainGraph.directDependantsOf(path)

          const alreadyInGraph = this.subgraph.incomingEdges[path];
          // const alreadyInGraph = path in this.subgraph;
          if(dependents.length !== 0 && alreadyInGraph.length === 0){

              dependents.forEach(dep => {
                  // const val= this.mainGraph.getNodeData(dep);
                  // this.subgraph.addNode(dep,val);
                  if(dep.includes(':')){
                      const subpath = dep.substring(0, dep.indexOf(':'));
                      // this.subgraph.addNode(subpath,val);
                      this.subgraph.addDependency(subpath,dep);
                      this.subgraph.addDependency(dep,path);
                      /!*
                                          const subdeps = this.mainGraph.directDependantsOf(path);
                                          console.log('subdeps',path, subdeps);
                                          subdeps.forEach(sdep => {
                                              const sval= this.mainGraph.getNodeData(sdep);
                                              this.subgraph.addNode(sdep,sval);
                                              console.log('subdep',sdep);
                                          });
                      *!/
                      if(this.subgraph.incomingEdges[dep] === 0){
                          this._addSubgraphDependencies(subpath)
                      }

                  }
              });

          }

      }
  */

    /**
     * (re-) computes a modelItem.
     * @param node - the node the modelItem is attached to
     * @param path - the canonical XPath of the node
     */
    compute(node, path) {
        const modelItem = this.getModelItem(node);
        if (modelItem && path.includes(':')) {
            const property = path.split(':')[1];
            if (property) {
                /*
                        if (property === 'readonly') {
                            // make sure that calculated items are always readonly
                            if(modelItem.bind['calculate']){
                                modelItem.readonly =  true;
                            }else {
                                const expr = modelItem.bind[property];
                                const compute = evaluateXPathToBoolean(expr, modelItem.node, this);
                                modelItem.readonly = compute;
                            }
                        }
        */
                if (property === 'calculate') {
                    const expr = modelItem.bind[property];
                    const compute = evaluateXPath(expr, modelItem.node, this);
                    modelItem.value = compute;
                    modelItem.readonly = true; // calculated nodes are always readonly
                } else if (property !== 'constraint' && property !== 'type') {
                    const expr = modelItem.bind[property];
                    if (expr) {
                        const compute = evaluateXPathToBoolean(expr, modelItem.node, this);
                        modelItem[property] = compute;
                        /*
                                    console.log(
                                      `recalculating path ${path} - Expr:'${expr}' computed`,
                                      modelItem[property],
                                    );
                        */
                    }
                }
            }
            this.computes += 1;
        }
    }

    /**
     * Iterates all modelItems to calculate the validation status.
     *
     * Model alerts are given on 'fx-bind' elements as either attribute `alert` or as `fx-alert` child elements.
     *
     * During model-construct all model alerts are added to the modelItem if any
     *
     * to revalidate:
     * Gets the `constraint` attribute declaration from modelItem.bind
     * Computes the XPath to a Boolean
     * Updates the modelItem.constraint property
     *
     * todo: type checking
     * todo: run browser validation API
     *
     */
    revalidate() {
        console.info('%crevalidate', 'font-style: italic; background: #90a4ae; color:white; padding:0.3rem 5rem 0.3rem 0.3rem;display:block;width:100%;');

        if (this.modelItems.length === 0) return true;

        console.group('### revalidate');
        console.time('revalidate');

        // reset submission validation
        // this.parentNode.classList.remove('submit-validation-failed')
        let valid = true;
        this.modelItems.forEach(modelItem => {
            // console.log('validating node ', modelItem.node);

            const {bind} = modelItem;
            if (bind) {
                /*
                        todo: investigate why bind is an element when created in fx-bind.init() and an fx-bind object when
                          created lazily.
                        */
                if (typeof bind.hasAttribute === 'function' && bind.hasAttribute('constraint')) {
                    const constraint = bind.getAttribute('constraint');
                    if (constraint) {
                        const compute = evaluateXPathToBoolean(constraint, modelItem.node, this);
                        // console.log('modelItem validity computed: ', compute);
                        modelItem.constraint = compute;
                        this.formElement.addToRefresh(modelItem); // let fore know that modelItem needs refresh
                        if (!compute) valid = false;
                    }
                }
                if (typeof bind.hasAttribute === 'function' && bind.hasAttribute('required')) {
                    const required = bind.getAttribute('required');
                    if (required) {
                        const compute = evaluateXPathToBoolean(required, modelItem.node, this);
                        // console.log('modelItem required computed: ', compute);
                        modelItem.required = compute;
                        this.formElement.addToRefresh(modelItem); // let fore know that modelItem needs refresh
                        if (!modelItem.node.textContent) {
                            console.log('modelItem required check failed: ');
                            valid = false;
                        }
                        // if (!compute) valid = false;
                        /*
                                    if (!this.modelConstructed) {
                                      // todo: get alert from attribute or child element
                                      const alert = bind.getAlert();
                                      if (alert) {
                                        modelItem.addAlert(alert);
                                      }
                                    }
                        */
                    }
                }
            }
        });
        console.timeEnd('revalidate');
        console.log('modelItems after revalidate: ', this.modelItems);
        console.groupEnd();
        return valid;
    }

    /**
     *
     * @param node
     * @returns {ModelItem}
     */
    getModelItem(node) {
        return this.modelItems.find(m => m.node === node);
    }

    /**
     * get the default evaluation context for this model.
     * @returns {Element} the
     */
    getDefaultContext() {
        return this.instances[0].getDefaultContext();
    }

    getDefaultInstance() {
        return this?.instances[0];
    }

    getDefaultInstanceData() {
        console.log('default instance data ', this.instances[0].instanceData);
        return this.instances[0].instanceData;
    }

    getInstance(id) {
        // console.log('getInstance ', id);
        // console.log('instances ', this.instances);
        // console.log('instances array ',Array.from(this.instances));

        const instArray = Array.from(this.instances);
        return instArray.find(inst => inst.id === id);
    }

    evalBinding(bindingExpr) {
        // console.log('MODEL.evalBinding ', bindingExpr);
        // default context of evaluation is always the default instance
        const result = this.instances[0].evalXPath(bindingExpr);
        return result;
    }
}

if (!customElements.get('fx-model')) {
    customElements.define('fx-model', FxModel);
}
