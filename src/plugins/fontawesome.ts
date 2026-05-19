import type { App } from 'vue'
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faTrash,
  faPlus,
  faCheck,
  faSpinner,
  faExclamationTriangle,
  faBookmark,
  faChevronLeft,
  faLocationDot,
  faBuilding,
  faXmark,
  faCircleInfo,
  faEnvelope,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons'

library.add(
  faTrash,
  faPlus,
  faCheck,
  faSpinner,
  faExclamationTriangle,
  faBookmark,
  faChevronLeft,
  faLocationDot,
  faBuilding,
  faXmark,
  faCircleInfo,
  faEnvelope,
  faUserTie,
)

export function registerFontAwesome(app: App) {
  app.component('font-awesome-icon', FontAwesomeIcon)
}

