/* empty css                                    */
import { f as createComponent, e as createAstro, k as renderComponent, n as renderSlot, r as renderTemplate, l as defineScriptVars, o as renderScript, m as maybeRenderHead } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { b as $$SignedIn, $ as $$BaseLayout } from "../chunks/BaseLayout_B7lVY6IF.mjs";
import { $ as $$InternalUIComponentRenderer } from "../chunks/InternalUIComponentRenderer_6kyXJqjO.mjs";
import "clsx";
import { renderers } from "../renderers.mjs";
const $$Astro$4 = createAstro("http://localhost:4322");
const $$UserButton = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$4, $$props, $$slots);
  Astro2.self = $$UserButton;
  return renderTemplate`${renderComponent($$result, "InternalUIComponentRenderer", $$InternalUIComponentRenderer, { ...Astro2.props, "component": "user-button" })} ${renderSlot($$result, $$slots["default"])}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/interactive/UserButton/UserButton.astro", void 0);
var __freeze$1 = Object.freeze;
var __defProp$1 = Object.defineProperty;
var __template$1 = (cooked, raw) => __freeze$1(__defProp$1(cooked, "raw", { value: __freeze$1(raw || cooked.slice()) }));
var _a$1;
const $$Astro$3 = createAstro("http://localhost:4322");
const $$MenuItemRenderer = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$3, $$props, $$slots);
  Astro2.self = $$MenuItemRenderer;
  const { label, href, open, clickIdentifier, parent } = Astro2.props;
  let labelIcon = "";
  if (Astro2.slots.has("label-icon")) {
    labelIcon = await Astro2.slots.render("label-icon");
  }
  const isDevMode = false;
  return renderTemplate(_a$1 || (_a$1 = __template$1(["<script>(function(){", "\n  const parentElement = document.currentScript.parentElement;\n\n  // We used a web component in the `<UserButton.MenuItems>` component.\n  const hasParentMenuItem = parentElement.tagName.toLowerCase() === 'clerk-user-button-menu-items';\n  if (!hasParentMenuItem) {\n    if (isDevMode) {\n      throw new Error(\n        `Clerk: <UserButton.MenuItems /> component can only accept <UserButton.Action /> and <UserButton.Link /> as its children. Any other provided component will be ignored.`,\n      );\n    }\n    return;\n  }\n\n  // Get the user button map from window that we set in the `<InternalUIComponentRenderer />`.\n  const userButtonComponentMap = window.__astro_clerk_component_props.get('user-button');\n\n  let userButton;\n  if (parent) {\n    userButton = document.querySelector(`[data-clerk-id=\"clerk-user-button-${parent}\"]`);\n  } else {\n    userButton = document.querySelector('[data-clerk-id^=\"clerk-user-button\"]');\n  }\n\n  const safeId = userButton.getAttribute('data-clerk-id');\n  const currentOptions = userButtonComponentMap.get(safeId);\n\n  const reorderItemsLabels = ['manageAccount', 'signOut'];\n  const isReorderItem = reorderItemsLabels.includes(label);\n\n  let newMenuItem = {\n    label,\n  };\n\n  if (!isReorderItem) {\n    newMenuItem = {\n      ...newMenuItem,\n      mountIcon: el => {\n        el.innerHTML = labelIcon;\n      },\n      unmountIcon: () => {\n        /* What to clean up? */\n      },\n    };\n\n    if (href) {\n      newMenuItem.href = href;\n    } else if (open) {\n      newMenuItem.open = open.startsWith('/') ? open : `/${open}`;\n    } else if (clickIdentifier) {\n      const clickEvent = new CustomEvent('clerk:menu-item-click', { detail: clickIdentifier });\n      newMenuItem.onClick = () => {\n        document.dispatchEvent(clickEvent);\n      };\n    }\n  }\n\n  userButtonComponentMap.set(safeId, {\n    ...currentOptions,\n    customMenuItems: [...(currentOptions?.customMenuItems ?? []), newMenuItem],\n  });\n})();<\/script>"], ["<script>(function(){", "\n  const parentElement = document.currentScript.parentElement;\n\n  // We used a web component in the \\`<UserButton.MenuItems>\\` component.\n  const hasParentMenuItem = parentElement.tagName.toLowerCase() === 'clerk-user-button-menu-items';\n  if (!hasParentMenuItem) {\n    if (isDevMode) {\n      throw new Error(\n        \\`Clerk: <UserButton.MenuItems /> component can only accept <UserButton.Action /> and <UserButton.Link /> as its children. Any other provided component will be ignored.\\`,\n      );\n    }\n    return;\n  }\n\n  // Get the user button map from window that we set in the \\`<InternalUIComponentRenderer />\\`.\n  const userButtonComponentMap = window.__astro_clerk_component_props.get('user-button');\n\n  let userButton;\n  if (parent) {\n    userButton = document.querySelector(\\`[data-clerk-id=\"clerk-user-button-\\${parent}\"]\\`);\n  } else {\n    userButton = document.querySelector('[data-clerk-id^=\"clerk-user-button\"]');\n  }\n\n  const safeId = userButton.getAttribute('data-clerk-id');\n  const currentOptions = userButtonComponentMap.get(safeId);\n\n  const reorderItemsLabels = ['manageAccount', 'signOut'];\n  const isReorderItem = reorderItemsLabels.includes(label);\n\n  let newMenuItem = {\n    label,\n  };\n\n  if (!isReorderItem) {\n    newMenuItem = {\n      ...newMenuItem,\n      mountIcon: el => {\n        el.innerHTML = labelIcon;\n      },\n      unmountIcon: () => {\n        /* What to clean up? */\n      },\n    };\n\n    if (href) {\n      newMenuItem.href = href;\n    } else if (open) {\n      newMenuItem.open = open.startsWith('/') ? open : \\`/\\${open}\\`;\n    } else if (clickIdentifier) {\n      const clickEvent = new CustomEvent('clerk:menu-item-click', { detail: clickIdentifier });\n      newMenuItem.onClick = () => {\n        document.dispatchEvent(clickEvent);\n      };\n    }\n  }\n\n  userButtonComponentMap.set(safeId, {\n    ...currentOptions,\n    customMenuItems: [...(currentOptions?.customMenuItems ?? []), newMenuItem],\n  });\n})();<\/script>"])), defineScriptVars({ label, href, open, clickIdentifier, labelIcon, isDevMode, parent }));
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/interactive/UserButton/MenuItemRenderer.astro", void 0);
const $$Astro$2 = createAstro("http://localhost:4322");
const $$UserButtonLink = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$UserButtonLink;
  const { label, href, parent } = Astro2.props;
  return renderTemplate`${renderComponent($$result, "MenuItemRenderer", $$MenuItemRenderer, { "label": label, "href": href, "parent": parent }, { "label-icon": ($$result2) => renderTemplate`${renderSlot($$result2, $$slots["label-icon"])}` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/interactive/UserButton/UserButtonLink.astro", void 0);
const $$Astro$1 = createAstro("http://localhost:4322");
const $$UserButtonAction = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$UserButtonAction;
  const { label, open, clickIdentifier, parent } = Astro2.props;
  return renderTemplate`${renderComponent($$result, "MenuItemRenderer", $$MenuItemRenderer, { "label": label, "open": open, "clickIdentifier": clickIdentifier, "parent": parent }, { "label-icon": ($$result2) => renderTemplate`${renderSlot($$result2, $$slots["label-icon"])}` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/interactive/UserButton/UserButtonAction.astro", void 0);
const $$UserButtonMenuItems = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "clerk-user-button-menu-items", "clerk-user-button-menu-items", {}, { "default": () => renderTemplate` ${renderSlot($$result, $$slots["default"])} ` })} ${renderScript($$result, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/interactive/UserButton/UserButtonMenuItems.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/interactive/UserButton/UserButtonMenuItems.astro", void 0);
var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));
var _a;
const $$Astro = createAstro("http://localhost:4322");
const $$UserButtonUserProfilePage = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$UserButtonUserProfilePage;
  const { url, label, parent } = Astro2.props;
  let labelIcon = "";
  let content = "";
  if (Astro2.slots.has("label-icon")) {
    labelIcon = await Astro2.slots.render("label-icon");
  }
  if (Astro2.slots.has("default")) {
    content = await Astro2.slots.render("default");
  }
  return renderTemplate(_a || (_a = __template(["<script>(function(){", "\n  // Get the user button map from window that we set in the `<InternalUIComponentRenderer />`.\n  const userButtonComponentMap = window.__astro_clerk_component_props.get('user-button');\n\n  let userButton;\n  if (parent) {\n    userButton = document.querySelector(`[data-clerk-id=\"clerk-user-button-${parent}\"]`);\n  } else {\n    userButton = document.querySelector('[data-clerk-id^=\"clerk-user-button\"]');\n  }\n\n  const safeId = userButton.getAttribute('data-clerk-id');\n  const currentOptions = userButtonComponentMap.get(safeId);\n\n  const newCustomPage = {\n    label,\n    url,\n    mountIcon: el => {\n      el.innerHTML = labelIcon;\n    },\n    unmountIcon: () => {\n      /* What to clean up? */\n    },\n    mount: el => {\n      el.innerHTML = content;\n    },\n    unmount: () => {\n      /* What to clean up? */\n    },\n  };\n\n  userButtonComponentMap.set(safeId, {\n    ...currentOptions,\n    userProfileProps: {\n      customPages: [...(currentOptions?.userProfileProps?.customPages ?? []), newCustomPage],\n    },\n  });\n})();<\/script>"], ["<script>(function(){", "\n  // Get the user button map from window that we set in the \\`<InternalUIComponentRenderer />\\`.\n  const userButtonComponentMap = window.__astro_clerk_component_props.get('user-button');\n\n  let userButton;\n  if (parent) {\n    userButton = document.querySelector(\\`[data-clerk-id=\"clerk-user-button-\\${parent}\"]\\`);\n  } else {\n    userButton = document.querySelector('[data-clerk-id^=\"clerk-user-button\"]');\n  }\n\n  const safeId = userButton.getAttribute('data-clerk-id');\n  const currentOptions = userButtonComponentMap.get(safeId);\n\n  const newCustomPage = {\n    label,\n    url,\n    mountIcon: el => {\n      el.innerHTML = labelIcon;\n    },\n    unmountIcon: () => {\n      /* What to clean up? */\n    },\n    mount: el => {\n      el.innerHTML = content;\n    },\n    unmount: () => {\n      /* What to clean up? */\n    },\n  };\n\n  userButtonComponentMap.set(safeId, {\n    ...currentOptions,\n    userProfileProps: {\n      customPages: [...(currentOptions?.userProfileProps?.customPages ?? []), newCustomPage],\n    },\n  });\n})();<\/script>"])), defineScriptVars({ url, label, content, labelIcon, parent }));
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/interactive/UserButton/UserButtonUserProfilePage.astro", void 0);
const UserButton = Object.assign($$UserButton, {
  MenuItems: $$UserButtonMenuItems,
  Link: $$UserButtonLink,
  Action: $$UserButtonAction,
  UserProfilePage: $$UserButtonUserProfilePage
});
const prerender = false;
const $$Dashboard = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "SignedIn", $$SignedIn, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "BaseLayout", $$BaseLayout, { "title": "App - Muse Square", "hideSurveyCta": true }, { "default": ($$result3) => renderTemplate` ${maybeRenderHead()}<div class="max-w-4xl mx-auto py-12 px-4"> <div class="flex items-center justify-between mb-8"> <h1 class="text-3xl font-bold">Welcome to your dashboard</h1> ${renderComponent($$result3, "UserButton", UserButton, {})} </div> <div class="bg-gray-50 p-6 rounded-lg"> <h2 class="text-xl font-semibold mb-4">You're signed in!</h2> <p class="text-gray-600">This is your protected dashboard. Only authenticated users can see this.</p> </div> </div> ` })} ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/dashboard.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/dashboard.astro";
const $$url = "/dashboard";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Dashboard,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
