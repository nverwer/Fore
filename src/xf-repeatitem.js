import {LitElement,html, css} from "lit-element";
import {BoundElement} from "./BoundElement.js";


/**
 * `xf-repeat`
 * an xformish form for eXist-db
 *
 * @customElement
 * @polymer
 * @demo demo/index.html
 */
export class XfRepeatitem extends BoundElement{

    static get styles() {
        return css`
            :host {
              display: block;
            }
        `;
    }

/*
    render() {
        return html`
          <slot></slot>
        `;
    }
*/

    static get properties() {
        return {
        };
    }

    constructor(){
        super();
    }

    firstUpdated(_changedProperties) {
        // console.log('### xf-repeatitem firstUpdated ', this);
        this.dispatchEvent(new CustomEvent('repeatitem-created', {
            composed: true,
            bubbles: true,
            detail: {item: this}
        }));

    }

    updated(_changedProperties) {
        super.updated(_changedProperties);
/*
        this.dispatchEvent(new CustomEvent('repeatitem-created', {
            composed: true,
            bubbles: true,
            detail: {item: this}
        }));
*/
    }

    refresh() {
        // console.log('REPEATITEM.refresh');
        console.log('REPEATITEM.refresh nodeset ', this.nodeset);

        const boundElements = this.querySelectorAll('[ref]');
        boundElements.forEach(bound => {


            // console.log('refresh bound element ', bound);
            // console.log('refresh bound element ', bound.tagName);
            // console.log('refresh bound element ', bound.closest('xf-model'));

            bound.context = this.nodeset;

            const isModel = bound.closest('xf-model');
            if(!isModel){
                bound.refresh();
            }

        });


    }

    createRenderRoot() {
        /**
         * Render template without shadow DOM. Note that shadow DOM features like
         * encapsulated CSS and slots are unavailable.
         */
        return this;
    }

}

window.customElements.define('xf-repeatitem', XfRepeatitem);
