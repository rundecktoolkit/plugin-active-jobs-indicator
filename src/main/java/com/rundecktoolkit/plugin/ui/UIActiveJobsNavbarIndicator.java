package com.rundecktoolkit.plugin.ui;

import com.dtolabs.rundeck.core.plugins.Plugin;
import com.dtolabs.rundeck.core.plugins.PluginException;
import com.dtolabs.rundeck.core.plugins.PluginResourceLoader;
import com.dtolabs.rundeck.plugins.ServiceNameConstants;
import com.dtolabs.rundeck.plugins.descriptions.PluginDescription;
import com.dtolabs.rundeck.plugins.rundeck.UIPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;

@Plugin(name = UIActiveJobsNavbarIndicator.PROVIDER_NAME, service = ServiceNameConstants.UI)
@PluginDescription(
    title = UIActiveJobsNavbarIndicator.PLUGIN_TITLE,
    description = UIActiveJobsNavbarIndicator.PLUGIN_DESC
)
public class UIActiveJobsNavbarIndicator implements UIPlugin, PluginResourceLoader {
    public static final String PROVIDER_NAME = "ui-active-jobs-navbar-indicator";
    public static final String PLUGIN_TITLE = "Active Jobs Navbar Indicator";
    public static final String PLUGIN_DESC = "Shows a running-execution indicator in the main navbar.";

    private static final List<String> SCRIPTS = Arrays.asList("active-jobs/indicator.v11.js");
    private static final List<String> STYLES = Arrays.asList("active-jobs/indicator.css");
    private static final List<String> ALL_RESOURCES = Arrays.asList(
        "active-jobs/indicator.v11.js",
        "active-jobs/indicator.css"
    );

    @Override
    public List<String> listResources() throws PluginException, IOException {
        return ALL_RESOURCES;
    }

    @Override
    public InputStream openResourceStreamFor(final String name) throws PluginException, IOException {
        InputStream stream = this.getClass().getResourceAsStream("/" + name);
        if (stream == null) {
            stream = this.getClass().getClassLoader().getResourceAsStream(name);
        }
        if (stream == null && Thread.currentThread().getContextClassLoader() != null) {
            stream = Thread.currentThread().getContextClassLoader().getResourceAsStream(name);
        }
        return stream;
    }

    @Override
    public boolean doesApply(final String path) {
        return true;
    }

    @Override
    public List<String> resourcesForPath(final String path) {
        return ALL_RESOURCES;
    }

    @Override
    public List<String> scriptResourcesForPath(final String path) {
        return SCRIPTS;
    }

    @Override
    public List<String> styleResourcesForPath(final String path) {
        return STYLES;
    }

    @Override
    public List<String> requires(final String path) {
        return null;
    }
}
