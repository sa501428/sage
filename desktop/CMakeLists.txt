cmake_minimum_required(VERSION 3.21)

project(SAGEDesktop VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(SAGE_ROOT "${CMAKE_CURRENT_LIST_DIR}/..")
set(SAGE_ASSETS
  "${SAGE_ROOT}/index.html"
  "${SAGE_ROOT}/styles.css"
  "${SAGE_ROOT}/manifest.webmanifest"
  "${SAGE_ROOT}/src/app.js"
)
set(SAGE_MACOS_ICON "${CMAKE_CURRENT_LIST_DIR}/icons/SAGE.icns")
set(SAGE_WINDOWS_ICON "${CMAKE_CURRENT_LIST_DIR}/icons/SAGE.ico")

if(APPLE)
  enable_language(OBJCXX)

  add_executable(SAGE MACOSX_BUNDLE
    src/macos/main.mm
    "${SAGE_MACOS_ICON}"
    ${SAGE_ASSETS}
  )

  set_source_files_properties(
    "${SAGE_ROOT}/index.html"
    "${SAGE_ROOT}/styles.css"
    "${SAGE_ROOT}/manifest.webmanifest"
    PROPERTIES MACOSX_PACKAGE_LOCATION "Resources/app"
  )
  set_source_files_properties(
    "${SAGE_ROOT}/src/app.js"
    PROPERTIES MACOSX_PACKAGE_LOCATION "Resources/app/src"
  )
  set_source_files_properties(
    "${SAGE_MACOS_ICON}"
    PROPERTIES MACOSX_PACKAGE_LOCATION "Resources"
  )

  set_target_properties(SAGE PROPERTIES
    MACOSX_BUNDLE_GUI_IDENTIFIER "org.sage.desktop"
    MACOSX_BUNDLE_BUNDLE_NAME "SAGE"
    MACOSX_BUNDLE_DISPLAY_NAME "SAGE"
    MACOSX_BUNDLE_ICON_FILE "SAGE.icns"
    MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}"
    MACOSX_BUNDLE_BUNDLE_VERSION "${PROJECT_VERSION}"
    MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_LIST_DIR}/src/macos/Info.plist.in"
    XCODE_ATTRIBUTE_CLANG_ENABLE_OBJC_ARC YES
  )

  target_link_libraries(SAGE PRIVATE
    "-framework Cocoa"
    "-framework WebKit"
  )
  target_compile_options(SAGE PRIVATE "$<$<COMPILE_LANGUAGE:OBJCXX>:-fobjc-arc>")

  install(TARGETS SAGE BUNDLE DESTINATION .)
elseif(WIN32)
  file(TO_NATIVE_PATH "${SAGE_WINDOWS_ICON}" SAGE_WINDOWS_ICON_RC)
  string(REPLACE "\\" "\\\\" SAGE_WINDOWS_ICON_RC "${SAGE_WINDOWS_ICON_RC}")
  configure_file(
    "${CMAKE_CURRENT_LIST_DIR}/src/windows/SAGE.rc.in"
    "${CMAKE_CURRENT_BINARY_DIR}/SAGE.rc"
    @ONLY
  )

  add_executable(SAGE WIN32
    src/windows/main.cpp
    "${CMAKE_CURRENT_BINARY_DIR}/SAGE.rc"
    src/windows/SAGE.exe.manifest
  )

  target_compile_definitions(SAGE PRIVATE
    UNICODE
    _UNICODE
    NOMINMAX
    WIN32_LEAN_AND_MEAN
  )

  if(MSVC)
    target_compile_options(SAGE PRIVATE /W4 /permissive- /EHsc)
    target_link_options(SAGE PRIVATE "/MANIFESTINPUT:${CMAKE_CURRENT_LIST_DIR}/src/windows/SAGE.exe.manifest")
  endif()

  set(WEBVIEW2_ROOT "" CACHE PATH "Path to the Microsoft.Web.WebView2 NuGet package root")
  if(NOT WEBVIEW2_ROOT)
    if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/vendor/Microsoft.Web.WebView2/build/native/include/WebView2.h")
      set(WEBVIEW2_ROOT "${CMAKE_CURRENT_LIST_DIR}/vendor/Microsoft.Web.WebView2")
    elseif(EXISTS "${CMAKE_CURRENT_LIST_DIR}/vendor/Microsoft.Web.WebView2.1.0.3351.48/build/native/include/WebView2.h")
      set(WEBVIEW2_ROOT "${CMAKE_CURRENT_LIST_DIR}/vendor/Microsoft.Web.WebView2.1.0.3351.48")
    endif()
  endif()

  if(NOT WEBVIEW2_ROOT OR NOT EXISTS "${WEBVIEW2_ROOT}/build/native/include/WebView2.h")
    message(FATAL_ERROR "Set WEBVIEW2_ROOT to a Microsoft.Web.WebView2 NuGet package root.")
  endif()

  if(CMAKE_SIZEOF_VOID_P EQUAL 8)
    set(WEBVIEW2_ARCH "x64")
  else()
    set(WEBVIEW2_ARCH "x86")
  endif()
  if(CMAKE_SYSTEM_PROCESSOR MATCHES "ARM64|arm64|aarch64")
    set(WEBVIEW2_ARCH "arm64")
  endif()

  target_include_directories(SAGE PRIVATE
    "${WEBVIEW2_ROOT}/build/native/include"
  )
  target_link_libraries(SAGE PRIVATE
    "${WEBVIEW2_ROOT}/build/native/${WEBVIEW2_ARCH}/WebView2LoaderStatic.lib"
    ole32
    shlwapi
    user32
  )

  add_custom_command(TARGET SAGE POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E make_directory "$<TARGET_FILE_DIR:SAGE>/app/src"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${SAGE_ROOT}/index.html" "$<TARGET_FILE_DIR:SAGE>/app/index.html"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${SAGE_ROOT}/styles.css" "$<TARGET_FILE_DIR:SAGE>/app/styles.css"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${SAGE_ROOT}/manifest.webmanifest" "$<TARGET_FILE_DIR:SAGE>/app/manifest.webmanifest"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${SAGE_ROOT}/src/app.js" "$<TARGET_FILE_DIR:SAGE>/app/src/app.js"
  )

  install(TARGETS SAGE RUNTIME DESTINATION .)
  install(FILES
    "${SAGE_ROOT}/index.html"
    "${SAGE_ROOT}/styles.css"
    "${SAGE_ROOT}/manifest.webmanifest"
    DESTINATION app
  )
  install(FILES "${SAGE_ROOT}/src/app.js" DESTINATION app/src)
else()
  message(FATAL_ERROR "SAGE desktop currently supports macOS and Windows.")
endif()

set(CPACK_PACKAGE_NAME "SAGE")
set(CPACK_PACKAGE_VENDOR "SAGE")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Signature Analysis for Gel-based Experiments")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_INSTALL_DIRECTORY "SAGE")
set(CPACK_PACKAGE_FILE_NAME "SAGE-${PROJECT_VERSION}-${CMAKE_SYSTEM_NAME}")
set(CPACK_PACKAGE_EXECUTABLES "SAGE" "SAGE")

if(APPLE)
  set(CPACK_GENERATOR "DragNDrop")
  set(CPACK_DMG_VOLUME_NAME "SAGE")
  set(CPACK_DMG_FORMAT "UDZO")
  set(CPACK_DMG_VOLUME_ICON "${SAGE_MACOS_ICON}")
  set(CPACK_DMG_DISABLE_APPLICATIONS_SYMLINK OFF)
elseif(WIN32)
  set(CPACK_GENERATOR "WIX")
  set(CPACK_WIX_UPGRADE_GUID "3FFD32DC-31AF-4ED7-A302-E354801DC17C")
  set(CPACK_WIX_PRODUCT_GUID "*")
  set(CPACK_WIX_PRODUCT_ICON "${SAGE_WINDOWS_ICON}")
  set(CPACK_WIX_PROGRAM_MENU_FOLDER "SAGE")
  set(CPACK_WIX_PROPERTY_ARPCOMMENTS "Local-first gel and signature analysis desktop app.")
endif()

include(CPack)
