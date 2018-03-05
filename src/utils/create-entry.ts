import * as fs from "fs-extra"
import * as _ from "lodash"
import * as path from "path"
import * as prettier from "prettier"
import { IProjectInfo } from "./analyse-project-interface"
import { md5 } from "./md5"
import { IProjectConfig } from "./project-config-interface"
import {
  helperPath,
  markdownLayoutPath,
  markdownTempPath,
  notFoundPath,
  tempJsEntryPath
} from "./structor-config"

const MARKDOWN_LAYOUT_NAME = "MarkdownTemplate"
const MARKDOWN_WRAPPER = "MarkdownWrapper"

interface IEntryText {
  pageImporter: string
  pageRoutes: string
  layoutImporter: string
  notFoundImporter: string
  notFoundRoute: string
  setEnv: string
  setCustomEnv: string
  storesImporter: string
  storesHelper: string
  markdownImporter: string
  markedImporter: string
}

// Entry file content
const getEntryContent = (entryText: IEntryText, projectInfo: IProjectInfo, projectConfig: IProjectConfig, env: string) => {
  return `
    // tslint:disable
    import createBrowserHistory from "history/createBrowserHistory"
    import { setCustomEnv, setEnvLocal, setEnvProd } from "pri"
    import * as React from "react"
    import * as ReactDOM from "react-dom"
    import Loadable from "react-loadable"
    import { Redirect, Route, Router, Switch } from "react-router-dom"

    ${env === "local" ?
      `import { hot } from "react-hot-loader"` :
      ""
    }


    ${entryText.storesImporter}
    ${entryText.markdownImporter}
    ${entryText.markedImporter}

    const customHistory = createBrowserHistory({
      basename: "${env === "local" ? "/" : projectConfig.baseHref}"
    })

    ${entryText.setEnv}
    ${entryText.setCustomEnv}

    ${entryText.layoutImporter}
    ${entryText.notFoundImporter}
    ${entryText.pageImporter}

    class Root extends React.PureComponent<any, any> {
      public componentWillMount() {
        ${env === "local" ? `
          window.addEventListener("message", event => {
            const data = event.data
            switch(data.type) {
              case "changeRoute":
                customHistory.push(data.path)
                break
              default:
            }
          }, false)
        ` : ""}
      }

      public render() {
        return (
          ${projectInfo.stores.length > 0 ? "<Provider {...stores}>" : ""}
          <Router history={customHistory}>
            <Switch>
              ${entryText.pageRoutes}
              ${entryText.notFoundRoute}
            </Switch>
          </Router>
          ${projectInfo.stores.length > 0 ? "</Provider>" : ""}
        )
      }
    }

    ${env === "local" ?
      `
      const HotRoot = hot(module)(Root)

      ReactDOM.render(
        <HotRoot />,
        document.getElementById("root")
      )
    ` :
      `
      ReactDOM.render(
        <Root />,
        document.getElementById("root")
      )
    `
    }


  `
}

const getHelperContent = (entryText: IEntryText, info: IProjectInfo, env: string) => `
  /**
   * Do not edit this file.
   * This file is automatic generated to get type help.
   */

   ${entryText.storesHelper}
`

const safeName = (str: string) => _.upperFirst(_.camelCase(str))

export async function createEntry(info: IProjectInfo, projectRootPath: string, env: string, projectConfig: IProjectConfig) {
  const entryText: IEntryText = {
    pageImporter: "",
    pageRoutes: "",
    layoutImporter: "",
    notFoundImporter: "",
    notFoundRoute: "",
    setEnv: "",
    setCustomEnv: "",
    storesImporter: "",
    storesHelper: "",
    markdownImporter: "",
    markedImporter: ""
  }

  // Set env
  switch (env) {
    case "local":
      entryText.setEnv = `setEnvLocal()`
      break
    case "prod":
      entryText.setEnv = `setEnvProd()`
      break
    default:
  }

  // Set custom env
  if (projectConfig.env) {
    entryText.setCustomEnv = `setCustomEnv(${JSON.stringify(projectConfig.env)})`
  }

  // Set markdownImporter
  if (info.hasMarkdownFile) {
    const markdownRelativePath = path.relative(tempJsEntryPath.dir, path.join(markdownLayoutPath.dir, markdownLayoutPath.name))

    if (info.stores.length === 0) {
      entryText.markdownImporter = `import ${MARKDOWN_LAYOUT_NAME} from "${markdownRelativePath}"\n`
    } else {
      const markdownLayoutPure = `${MARKDOWN_LAYOUT_NAME}Pure`
      entryText.markdownImporter = `
        import ${markdownLayoutPure} from "${markdownRelativePath}"
        const ${MARKDOWN_LAYOUT_NAME} = Connect()(${markdownLayoutPure})
      `
    }
  }

  // Clear temp markdown files
  fs.emptyDirSync(path.join(projectRootPath, markdownTempPath.dir))

  // Set routes
  info.routes.forEach(route => {
    const filePath = path.parse(route.filePath)
    const relativePageFilePath = path.relative(projectRootPath, filePath.dir + "/" + filePath.name)
    const componentName = safeName(relativePageFilePath) + md5(relativePageFilePath).slice(0, 5)

    const pathInfo = path.parse(route.filePath)

    switch (filePath.ext) {
      case ".tsx":
      case ".ts":
        if (info.routes.length < 2) {
          // If only one page, don't need code splitting.
          if (info.stores.length === 0) {
            entryText.pageImporter += `
              import ${componentName} from "${path.join(pathInfo.dir, pathInfo.name)}"
            `
          } else {
            entryText.pageImporter += `
              import ${componentName}Temp from "${path.join(pathInfo.dir, pathInfo.name)}"
              const ${componentName} = Connect()(${componentName}Temp)
            `
          }
        } else {
          const importCode = info.stores.length === 0 ?
            `import(/* webpackChunkName: "${componentName}" */ "${path.join(pathInfo.dir, pathInfo.name)}")` :
            `import(/* webpackChunkName: "${componentName}" */"${path.join(pathInfo.dir, pathInfo.name)}").then(res => Connect()(res.default))  `

          entryText.pageImporter += `
            const ${componentName} = Loadable({
              loader: () => ${importCode},
              loading: (): any => null
            })\n
          `
        }
        break
      case ".md":
        if (!entryText.markedImporter) {
          entryText.markedImporter = `
            import * as highlight from "highlight.js"
            import "highlight.js/styles/github.css"
            import markdownIt from "markdown-it"

            const markdown = markdownIt({
              html: true,
              linkify: true,
              typographer: true,
              highlight: (str: string, lang: string) => {
                if (lang === "tsx") {
                  lang = "jsx"
                }

                if (lang === "typescript") {
                  lang = "javascript"
                }

                if (lang && highlight.getLanguage(lang)) {
                  try {
                    return highlight.highlight(lang, str).value;
                  } catch (__) {
                    //
                  }
                }

                return ""
              }
            })

            const ${MARKDOWN_WRAPPER} = ({ children }: any) => (
              <div dangerouslySetInnerHTML={{ __html: markdown.render(children as string) }} />
            )
          `
        }

        // Create esmodule file for markdown
        const fileContent = fs.readFileSync(route.filePath).toString()
        const safeFileContent = fileContent.replace(/\`/g, `\\\``)
        const markdownTsAbsolutePath = path.join(projectRootPath, markdownTempPath.dir, componentName + ".ts")
        const markdownTsAbsolutePathWithoutExt = path.join(projectRootPath, markdownTempPath.dir, componentName)
        fs.outputFileSync(markdownTsAbsolutePath, `export default \`${safeFileContent}\``)

        if (info.routes.length < 2) {
          // If only one page, don't need code splitting.
          const tempComponentName = `${componentName}Md`
          const wrapperStr = `<${MARKDOWN_WRAPPER}>{${tempComponentName}}</${MARKDOWN_WRAPPER}>`
          if (info.hasMarkdownFile) {
            entryText.pageImporter += `
              import ${tempComponentName} from "${markdownTsAbsolutePathWithoutExt}"
              const ${componentName} = () => (
                <${MARKDOWN_LAYOUT_NAME}>
                  ${wrapperStr}
                </${MARKDOWN_LAYOUT_NAME}>
              )
            `
          } else {
            entryText.pageImporter += `
              import ${tempComponentName} from "${markdownTsAbsolutePathWithoutExt}"
              const ${componentName} = () => (${wrapperStr})
            `
          }
        } else {
          let importCode = ""
          const wrapperStr = `<${MARKDOWN_WRAPPER}>{code.default}</${MARKDOWN_WRAPPER}>`
          if (info.hasMarkdownFile) {
            importCode = `
              import(/* webpackChunkName: "${componentName}" */ "${markdownTsAbsolutePathWithoutExt}").then(code => {
                return () => (
                  <${MARKDOWN_LAYOUT_NAME}>
                    ${wrapperStr}
                  </${MARKDOWN_LAYOUT_NAME}>
                )
              })
            `
          } else {
            importCode = `
              import(/* webpackChunkName: "${componentName}" */ "${markdownTsAbsolutePathWithoutExt}").then(code => {
                return () => (${wrapperStr})
              })
            `
          }

          entryText.pageImporter += `
            const ${componentName} = Loadable({
              loader: () => ${importCode},
              loading: (): any => null
            })\n
          `
        }
        break
      default:
    }

    const routeComponent = info.layout ? "LayoutRoute" : "Route"

    entryText.pageRoutes += `
      <${routeComponent} exact path="${route.path}" component={${componentName}} />\n
    `
  })

  // Set stores
  if (info.stores.length > 0) {
    const entryRelativeToHelper = path.relative(path.join(tempJsEntryPath.dir), path.join(helperPath.dir, helperPath.name))
    entryText.storesImporter += `import { useStrict } from "dob"\n`
    entryText.storesImporter += `import { Connect, Provider } from "dob-react"\n`
    entryText.storesImporter += `useStrict()\n`
    entryText.storesImporter += `import { stores } from "${entryRelativeToHelper}"\n`
    entryText.storesHelper += `import { combineStores } from "dob"\n`
    entryText.storesHelper += info.stores
      .map(eachStore => {
        const filePath = path.parse(eachStore.filePath)
        const importAbsolutePath = path.join(filePath.dir, filePath.name)
        const importRelativePath = path.relative(path.join(projectRootPath, helperPath.dir), importAbsolutePath)
        return `import { ${safeName(eachStore.name)}Action, ${safeName(eachStore.name)}Store } from "${importRelativePath}"`
      })
      .join("\n")
    entryText.storesHelper += `
      \nconst stores = combineStores({${info.stores.map(eachStore => {
        return `${safeName(eachStore.name)}Action, ${safeName(eachStore.name)}Store`
      }).join(",")}})

      export { stores }
    `
  }

  // Set layout
  if (info.layout) {
    const layoutPath = path.parse(info.layout.filePath)
    let layoutImportCode = ""

    if (info.stores.length === 0) {
      layoutImportCode = `import LayoutComponent from "${path.join(layoutPath.dir, layoutPath.name)}"`
    } else {
      layoutImportCode = `
        import LayoutComponentOrigin from "${path.join(layoutPath.dir, layoutPath.name)}"
        const LayoutComponent = Connect()(LayoutComponentOrigin)
      `
    }

    entryText.layoutImporter = `
      ${layoutImportCode}

      const LayoutRoute = ({ component: Component, ...rest }: any) => {
        return (
          <Route {...rest} render={matchProps => (
            <LayoutComponent>
              <Component {...matchProps} />
            </LayoutComponent>
          )} />
        )
      };\n
    `
  }

  // Set not found
  if (info.has404File) {
    entryText.notFoundImporter = `import NotFoundComponent from "${path.join(projectRootPath, path.join(notFoundPath.dir, notFoundPath.name))}"`
    entryText.notFoundRoute = `
      <Route component={NotFoundComponent} />
    `
  }

  // Create entry tsx file
  const entryPath = path.join(projectRootPath, path.format(tempJsEntryPath))
  fs.outputFileSync(entryPath, prettier.format(getEntryContent(entryText, info, projectConfig, env), {
    semi: false,
    parser: "typescript"
  }))

  // If has stores, create helper.ts
  const helperAbsolutePath = path.join(projectRootPath, path.format(helperPath))
  if (info.stores.length > 0) {
    fs.outputFileSync(helperAbsolutePath, prettier.format(getHelperContent(entryText, info, env), {
      semi: false,
      parser: "typescript"
    }))
  } else {
    fs.removeSync(helperAbsolutePath)
  }

  return entryPath
}
