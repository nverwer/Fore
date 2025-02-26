import '../fx-model.js';
import { foreElementMixin } from '../ForeElementMixin.js';
import { ModelItem } from '../modelitem.js';
import { Fore } from '../fore.js';

/**
 * `AbstractControl` -
 * is a general base class for control elements.
 *
 */
export default class AbstractControl extends foreElementMixin(HTMLElement) {
  constructor() {
    super();
    this.value = '';
    this.display = this.style.display;
    this.required = false;
    this.readonly = false;
    this.widget = null;
    this.visited = false;
    this.force = false;
    // this.attachShadow({ mode: 'open' });
  }


  // todo: discuss - this is a hack to circumvent that modelItems in toRefresh diverge from the modelItems in
  // the model in some situations. This code first looks for refresh
/*
  getModelItem() {
    console.log('toRefreshModelItems', this.getOwnerForm().toRefresh);
    const s = this.modelItem.path;
    console.log('toRefreshModelItems path', s);

    const toRefresh = this.getOwnerForm().toRefresh;
    let mi;
    if(toRefresh){
      mi = this.getOwnerForm().toRefresh.find(m => m.path === s);
    }

    return mi? mi: super.getModelItem();
    // console.log('toRefreshModelItems realitem', mi);

  }
*/

  // eslint-disable-next-line class-methods-use-this
  getWidget() {
    throw new Error('You have to implement the method getWidget!');
  }

  /**
   * (re)apply all modelItem state properties to this control. model -> UI
   */
  async refresh(force) {
    if(force) this.force=true;
    // console.log('### AbstractControl.refresh on : ', this);

    const currentVal = this.value;

    // if(this.repeated) return
    if (this.isNotBound()) return;

    // await this.updateComplete;
    // await this.getWidget();
    this.oldVal = this.nodeset ? this.nodeset : null;
    this.evalInContext();

    // todo this if should be removed - see above
    if (this.isBound()) {
      // this.control = this.querySelector('#control');

      if(!this.nodeset){
        this.style.display = 'none';
        return;
      }

      this.modelItem = this.getModelItem();
      // console.log('refresh modelItem', this.modelItem);

      if (this.modelItem instanceof ModelItem) {
        // console.log('### XfAbstractControl.refresh modelItem : ', this.modelItem);

        if (this.hasAttribute('as') && this.getAttribute('as') === 'node') {
          // console.log('as', this.nodeset);
          // this.modelItem.value = this.nodeset;
          this.modelItem.node = this.nodeset;
          this.value = this.modelItem.node;
        } else {
          this.value = this.modelItem.value;
        }

        // console.log('value of widget',this.value);

        /*
         * todo: find out on which foreign modelitems we might be dependant on when no binds are used.
         *
         * e.g. filter expr on 'ref' 'instance('countries')//country[@continent = instance('default')/continent]'
         *
         * the country node is dependant on instance('default')/continent here (foreign node).
         *
         * possible approach:
         * - pipe ref expression through DependencyNotifyingDomFacade to get referred nodes.
         * - lookup modelItems of referred nodes
         * - add ourselves to boundControls of foreign modelItem -> this control will then get refreshed when the foreign modelItem is changed.
         */

        // const touched = FxBind.getReferencesForRef(this.ref,Array.from(this.nodeset));
        // console.log('touched',touched);

        /*
        this is another case that highlights the fact that an init() function might make sense in general.
         */
        if (!this.modelItem.boundControls.includes(this)) {
          this.modelItem.boundControls.push(this);
        }

        // console.log('>>>>>>>> abstract refresh ', this.control);
        // this.control[this.valueProp] = this.value;
        await this.updateWidgetValue();
        this.handleModelItemProperties();

        // if(!this.closest('fx-fore').ready) return; // state change event do not fire during init phase (initial refresh)
        if(this.getOwnerForm().initialRun){
          Fore.dispatch(this,'init',{});
        }
        if (!this.getOwnerForm().ready) return; // state change event do not fire during init phase (initial refresh)
        if (currentVal !== this.value ) {
          // todo: discuss how to prevent unnecessary/unwanted value-changes e.g. when repeatitems are inserted
        // if (currentVal !== this.value && this.visited) {
          Fore.dispatch(this, 'value-changed', { path: this.modelItem.path , value:this.modelItem.value});
        }
      }
    }
  }

  refreshFromModelItem(modelItem){

  }

  /**
   *
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line class-methods-use-this
  async updateWidgetValue() {
    throw new Error('You have to implement the method updateWidgetValue!');
  }

  handleModelItemProperties() {
    // console.log('handleModelItemProperties',this.modelItem);
    this.handleRequired();
    this.handleReadonly();
    if (this.getOwnerForm().ready) {
      this.handleValid();
    }
    this.handleRelevant();
    // todo: handleType()
  }

  _getForm() {
    return this.getModel().parentNode;
  }

  _dispatchEvent(event) {
    if (this.getOwnerForm().ready) {
      Fore.dispatch(this, event, {});
    }
  }

  // eslint-disable-next-line class-methods-use-this
  handleRequired() {
    // console.log('mip required', this.modelItem.required);
    this.widget = this.getWidget();

    if(!this.modelItem.required){
      this.widget.removeAttribute('required');
      this.removeAttribute('required');
      if (this.isRequired() !== this.modelItem.required){
        this._dispatchEvent('optional');
      }
      return;
    }

    // ### modelItem is required
    if (this.visited || this.force) {
      if (this.modelItem.value === '') {
        this.classList.add('isEmpty');
        this._toggleValid(false);
      } else {
        this.classList.remove('isEmpty');
        this._toggleValid(true);
      }
    }
    this.widget.setAttribute('required', '');
    this.setAttribute('required', '');
    if (this.isRequired() !== this.modelItem.required) {
      this._dispatchEvent('required');
    }

/*
    if (this.isRequired() !== this.modelItem.required) {
      this._updateRequired();
    }
*/
  }


  _updateRequired() {
    if (this.modelItem.required) {
      // if (this.getOwnerForm().ready){
      if (this.visited || this.force) {
      // if (this.visited ) {
      //   if (this.widget.value === '') {
        if (this.modelItem.value === '') {
          this.classList.add('isEmpty');
          this._toggleValid(false);
        } else {
          this.classList.remove('isEmpty');
          this._toggleValid(true);
        }
      }
      this.widget.setAttribute('required', '');
      this.setAttribute('required', '');
      this._dispatchEvent('required');
    } else {
      this.widget.removeAttribute('required');
      this.removeAttribute('required');
      this._dispatchEvent('optional');
    }
  }

  _toggleValid(valid){
    if(valid){
      this.removeAttribute('invalid');
      this.setAttribute('valid','');
    }else{
      this.removeAttribute('valid');
      this.setAttribute('invalid','');
    }
  }

  handleReadonly() {
    // console.log('mip readonly', this.modelItem.isReadonly);
    if (this.isReadonly() !== this.modelItem.readonly) {
      if (this.modelItem.readonly) {
        this.widget.setAttribute('readonly', '');
        this.setAttribute('readonly', '');
        this._dispatchEvent('readonly');
      }
      if (!this.modelItem.readonly) {
        this.widget.removeAttribute('readonly');
        this.removeAttribute('readonly');
        this._dispatchEvent('readwrite');
      }
    }
  }

  // todo - review alert handling altogether. There could be potentially multiple ones in model
  handleValid() {
    // console.log('mip valid', this.modelItem.required);
    const alert = this.querySelector('fx-alert');

    const mi = this.getModelItem();
    // console.log('late modelItem', mi);
    if (this.isValid() !== this.modelItem.constraint) {
      if (this.modelItem.constraint) {
        // if (alert) alert.style.display = 'none';
        this._dispatchEvent('valid');
        this.setAttribute('valid','');
        this.removeAttribute('invalid');
      } else {
        this.setAttribute('invalid', '');
        this.removeAttribute('valid');
        // ### constraint is invalid - handle alerts
/*
        if (alert) {
          alert.style.display = 'block';
        }
*/
        if (this.modelItem.alerts.length !== 0) {

          const controlAlert = this.querySelector('fx-alert');
          if (!controlAlert) {
            const { alerts } = this.modelItem;
            // console.log('alerts from bind: ', alerts);
            alerts.forEach(modelAlert => {
              const newAlert = document.createElement('fx-alert');
              // const newAlert = document.createElement('span');
              newAlert.innerHTML = modelAlert;
              this.appendChild(newAlert);
              // newAlert.style.display = 'block';
            });
          }
        }

        // this.dispatchEvent(new CustomEvent('invalid', {}));
        this._dispatchEvent('invalid');
      }
    }
  }

  handleRelevant() {
    // console.log('mip valid', this.modelItem.enabled);
    const item = this.modelItem.node;
    if (Array.isArray(item) && item.length === 0) {
      this._dispatchEvent('nonrelevant');
      this.style.display = 'none';
      return;
    }
    if (this.isEnabled() !== this.modelItem.relevant) {
      if (this.modelItem.relevant) {
        this._dispatchEvent('relevant');
        // this._fadeIn(this, this.display);
        this.style.display = this.display;
      } else {
        this._dispatchEvent('nonrelevant');
        // this._fadeOut(this);
        this.style.display = 'none';
      }
    }
  }

  isRequired() {
    return this.hasAttribute('required');
  }

  isValid() {
    // return this.valid;
    if (this.hasAttribute('invalid')) {
      return false;
    }
    return true;
  }

  isReadonly() {
    // const widget = this.querySelector('#widget');
    return this.hasAttribute('readonly');
  }

  isEnabled() {
    // if(this.style.display === 'none' || this.classList.contains('non-relevant')){
    if (this.style.display === 'none') {
      return false;
    }
    return true;
  }

  // eslint-disable-next-line class-methods-use-this
  _fadeOut(el) {
    el.style.opacity = 1;

    (function fade() {
      // eslint-disable-next-line no-cond-assign
      if ((el.style.opacity -= 0.1) < 0) {
        el.style.display = 'none';
      } else {
        requestAnimationFrame(fade);
      }
    })();
  }

  // eslint-disable-next-line class-methods-use-this
  _fadeIn(el, display) {
    el.style.opacity = 0;
    el.style.display = display || 'block';

    (function fade() {
      let val = parseFloat(el.style.opacity);
      // eslint-disable-next-line no-cond-assign
      if (!((val += 0.1) > 1)) {
        el.style.opacity = val;
        requestAnimationFrame(fade);
      }
    })();
  }
}
if (!customElements.get('fx-abstract-control')) {
  window.customElements.define('fx-abstract-control', AbstractControl);
}
