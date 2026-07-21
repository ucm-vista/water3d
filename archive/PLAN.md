Quick recap
The meeting focused on reviewing and providing feedback on Ibrahim's agricultural monitoring tool, which tracks crop growth through growing degree days (GDD), chill hours, and evapotranspiration (ET) data. Katherine, Emery, and Ibrahim discussed ways to simplify data calls, improve the user interface, and enhance the tool's functionality by incorporating features from existing climate tools. Key recommendations included using 30-year climatology averages instead of 5-year averages, adding precipitation tracking, improving legend labels for clarity, and implementing user preferences for crop coefficients and temperature thresholds. The team also discussed potential integration with the Climate Toolbox and hosting options for the tool, with suggestions to use a UC Merced domain like "water.ucmerced.edu" for long-term stability.

Next steps
Emery
Investigate and decide on a domain name (e.g., water3d.ucmerced.edu) for hosting the Water3D tool.
Explore the possibility of integrating the Water3D tool into the Climate Toolbox for long-term sustainability.
Ibrahim
Fix the UI issue on the GDD graph to correctly display the projected line as dashed starting from the current day.
Update the temperature unit labels (e.g., Tmin/Tmax) to clarify they refer to base and upper temperature thresholds, not daily min/max.
Implement a global toggle to switch between Celsius and Fahrenheit, updating all relevant labels and values (including phenology numbers) accordingly.
Add a cumulative precipitation (PPT) graph or tab to the ET section.
Consider simplifying the ET graph by toggling between showing ET and CropET, rather than both on the same graph.
Update the historical average calculation from a 5-year to a 30-year climatology, and consider adding percentile bands for context.
Implement user preference storage in the browser to retain settings (e.g., crop, thresholds) between sessions.
Create a configuration file in the codebase to clearly document API paths and contact information for future maintenance.
Reach out to Katherine for assistance with API calls if needed during implementation.
Katherine
Provide an API endpoint for pre-computed P10, P50, and mean temperature data to reduce unnecessary API calls.
Summary
Crop Data Retrieval Simplification
The team discussed simplifying data retrieval for crop growth calculations by reducing the number of weather parameters from 48 to essential metrics like P10 and P50 values. Katherine agreed to create an endpoint that provides pre-computed P numbers to improve performance and reduce API calls. The discussion covered Ibrahim's GDD graph implementation, which shows current growth, historical data, and five-year averages, with plans to fix UI issues and add proper labeling for temperature units (Celsius/Fahrenheit conversion). The team also explored adding chill hour calculations, with Katherine offering to provide API access to historical chill data despite some date discrepancies in the existing implementation.

Chill Hour Model Implementation Discussion
Katherine explained the differences between static and dynamic chill hour models, noting that the dynamic model doesn't consider late-day warming and may penalize it. The team discussed implementing chill hour calculations using min/max daily temperatures from GridMet data rather than hourly data, which simplifies the process. They also addressed the need to account for regional variations in chill hour thresholds, particularly between Georgia and California, and agreed to include flexible crop-specific settings in their tool with default values based on research.

ET Dashboard Data Processing Updates
The team discussed data processing challenges for weather and evapotranspiration (ET) data, with Katherine suggesting using sinusoidal approximations for daily min/max values instead of processing hourly data due to volume concerns. They reviewed Ibrahim's ET dashboard which shows cumulative ET with multiple reference lines including crop ET, historical averages, and forecast data, with Emery recommending focusing on crop ET rather than general ET when a crop is selected. The discussion included suggestions to add cumulative precipitation data and improve legend labels to make the interface more intuitive, with Katherine recommending a toggle between ET and CropET views rather than showing both on the same graph.

Graph Visualization Improvement Discussion
Katherine and Ibrahim discussed improvements to a graph visualization, focusing on clarifying different lines and metrics. They agreed to separate ET and crop ET to avoid confusion, and Katherine suggested adding confidence bands around observed data to provide better context for comparisons. The team also discussed cleaning up legends and using different visual elements like color or patterns to distinguish between observed data and forecasts.