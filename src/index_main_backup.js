// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/All';

import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageReslice from '@kitware/vtk.js/Imaging/Core/ImageReslice';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkInteractorStyleImage from '@kitware/vtk.js/Interaction/Style/InteractorStyleImage';
import vtkResliceCursorWidget from '@kitware/vtk.js/Widgets/Widgets3D/ResliceCursorWidget';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';

import {CaptureOn, ViewTypes} from '@kitware/vtk.js/Widgets/Core/WidgetManager/Constants';

import {SlabMode} from '@kitware/vtk.js/Imaging/Core/ImageReslice/Constants';

import {
    xyzToViewType,
    InteractionMethodsName,
} from '@kitware/vtk.js/Widgets/Widgets3D/ResliceCursorWidget/Constants';
import controlPanel from './controlPanel.html';

// Force the loading of HttpDataAccessHelper to support gzip decompression
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkXMLImageDataReader from "@kitware/vtk.js/IO/XML/XMLImageDataReader";
import vtkFullScreenRenderWindow from "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow";
import vtkMath, {radiansFromDegrees} from "@kitware/vtk.js/Common/Core/Math";
import vtkPointSource from "@kitware/vtk.js/Filters/Sources/PointSource";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import myhanhJSON from './myhanh.json';
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import widgetBehavior from '@kitware/vtk.js/Widgets/Widgets3D/ResliceCursorWidget/cprBehavior';
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkRenderer from "@kitware/vtk.js/Rendering/Core/Renderer";
import vtkImageCPRMapper from "@kitware/vtk.js/Rendering/Core/ImageCPRMapper";
import vtkPlaneManipulator from "@kitware/vtk.js/Widgets/Manipulators/PlaneManipulator";
import vtkCPRManipulator from '@kitware/vtk.js/Widgets/Manipulators/CPRManipulator';
import {mat3, mat4, vec3} from "gl-matrix";
import { updateState } from '@kitware/vtk.js/Widgets/Widgets3D/ResliceCursorWidget/helpers';
import vtkPointPicker from "@kitware/vtk.js/Rendering/Core/PointPicker";
import vtkSphereSource from "@kitware/vtk.js/Filters/Sources/SphereSource";
import vtkOpenGLRenderWindow from "@kitware/vtk.js/Rendering/OpenGL/RenderWindow";


// ----------------------------------------------------------------------------
// Define main attributes
// ----------------------------------------------------------------------------

const reader = vtkXMLImageDataReader.newInstance({fetchGzip: true});
const viewAttributes = [];
window.va = viewAttributes;
const widget = vtkResliceCursorWidget.newInstance();
window.widget = widget;
const widgetState = widget.getWidgetState();
widgetState
    .getStatesWithLabel('sphere')
    .forEach((handle) => handle.setScale1(20));
// Set size in CSS pixel space because scaleInPixels defaults to true

const appCursorStyles = {
    translateCenter: 'move',
    rotateLine: 'alias',
    translateAxis: 'pointer',
    default: 'default',
};

// ----------------------------------------------------------------------------
// Define html structure
// ----------------------------------------------------------------------------

const container = document.querySelector('body');

// ----------------------------------------------------------------------------
// Setup rendering code
// ----------------------------------------------------------------------------

function createViewElement() {
    const elementParent = document.createElement('div');
    elementParent.setAttribute('class', 'view');
    elementParent.style.width = '50%';
    elementParent.style.height = '100%';
    elementParent.style.display = 'inline-block';

    const element = document.createElement('div');
    element.setAttribute('class', 'view');
    element.style.width = '100%';
    element.style.height = '100%';
    elementParent.appendChild(element);

    container.appendChild(elementParent);

    return element;
}

const elementImage = createViewElement();
const elementCpr = createViewElement();

const grw = vtkGenericRenderWindow.newInstance();
grw.setContainer(elementImage);
grw.resize();
const obj = {
    renderWindow: grw.getRenderWindow(),
    renderer: grw.getRenderer(),
    GLWindow: grw.getApiSpecificRenderWindow(),
    interactor: grw.getInteractor(),
    widgetManager: vtkWidgetManager.newInstance(),
    orientationWidget: null,
};

obj.renderer.getActiveCamera().setParallelProjection(true); // khong cho view bi phong to
obj.renderer.setBackground([0,0,0]);
obj.renderWindow.addRenderer(obj.renderer);
obj.renderWindow.addView(obj.GLWindow);
obj.renderWindow.setInteractor(obj.interactor);
obj.interactor.setView(obj.GLWindow);
obj.interactor.initialize();
obj.interactor.bindEvents(elementImage);
obj.widgetManager.setRenderer(obj.renderer);

obj.interactor.setInteractorStyle(vtkInteractorStyleImage.newInstance());

obj.widgetInstance = obj.widgetManager.addWidget(widget, xyzToViewType[2]);
// obj.widgetInstance.setScaleInPixels(true);
widgetState
    .getStatesWithLabel('line')
    .forEach((state) => state.setScale3(4, 4, 300));
widgetState
    .getStatesWithLabel('center')
    .forEach((state) => state.setOpacity(0));
widgetState
    .getStatesWithLabel('handles')
    .forEach((handle) => handle.setOpacity(0));
obj.widgetInstance.setCursorStyles(appCursorStyles);
obj.widgetManager.enablePicking();
// Use to update all renderers buffer when actors are moved
obj.widgetManager.setCaptureOn(CaptureOn.MOUSE_MOVE);

obj.reslice = vtkImageReslice.newInstance();
obj.reslice.setSlabMode(SlabMode.MEAN);
obj.reslice.setSlabNumberOfSlices(1);
obj.reslice.setTransformInputSampling(false);
obj.reslice.setOutputDimensionality(2);

obj.resliceMapper = vtkImageMapper.newInstance();
obj.resliceMapper.setInputConnection(obj.reslice.getOutputPort());
obj.resliceActor = vtkImageSlice.newInstance();
obj.resliceActor.setMapper(obj.resliceMapper);
obj.sphereActors = [];
obj.sphereSources = [];

const showPoints = true;
const centerlineJson = myhanhJSON;
const centerlineCoors = myhanhJSON.position;

const numberOfPoints = centerlineCoors.length / 3;

for (let j = 0; j < numberOfPoints; j++) {
    const sphere = vtkSphereSource.newInstance();
    sphere.setRadius(2);
    sphere.setThetaResolution(50);
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(sphere.getOutputPort());
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor([1,0,0]);
    actor.setVisibility(showPoints);
    obj.sphereActors.push(actor);
    obj.sphereSources.push(sphere);
}

// Reslice Cursor Widget

const centerline = vtkPolyData.newInstance();
let currentImage = null;
const stretchPlane = 'Y';
const crossPlane = 'Z';

function cpr() {

    const grw = vtkGenericRenderWindow.newInstance();
    grw.setContainer(elementCpr);
    grw.resize();
    const stretchRenderer = grw.getRenderer();
    // stretchRenderer.setBackground([0,0,0])
    const renderWindow = grw.getRenderWindow();

    const widget = vtkResliceCursorWidget.newInstance({
        planes: [stretchPlane, crossPlane],
        behavior: widgetBehavior,
    });
    const widgetManager = vtkWidgetManager.newInstance();
    widgetManager.setRenderer(stretchRenderer);
    const stretchViewType = ViewTypes.XZ_PLANE;
    const crossViewType = ViewTypes.XY_PLANE;
    const stretchViewWidgetInstance = widgetManager.addWidget(
        widget,
        stretchViewType
    );
    const widgetState = widget.getWidgetState();

// Set size in CSS pixel space because scaleInPixels defaults to true
    widgetState
        .getStatesWithLabel('sphere')
        .forEach((handle) => handle.setScale1(20));
    widgetState.getCenterHandle().setVisible(false);
    widgetState
        .getStatesWithLabel(`rotationIn${stretchPlane}`)
        .forEach((handle) => handle.setVisible(false));

    const crossRenderer = vtkRenderer.newInstance();
    crossRenderer.setViewport(0.7, 0, 1, 0.3);
    renderWindow.addRenderer(crossRenderer);
    renderWindow.setNumberOfLayers(2);
    crossRenderer.setLayer(1);
    const crossWidgetManager = vtkWidgetManager.newInstance();
    crossWidgetManager.setRenderer(crossRenderer);
    const crossViewWidgetInstance = crossWidgetManager.addWidget(
        widget,
        crossViewType
    );

    const reslice = vtkImageReslice.newInstance();
    reslice.setTransformInputSampling(false);
    reslice.setAutoCropOutput(true);
    reslice.setOutputDimensionality(2);
    const resliceMapper = vtkImageMapper.newInstance();
    resliceMapper.setBackgroundColor(0, 0, 0, 0);
    resliceMapper.setInputConnection(reslice.getOutputPort());
    const resliceActor = vtkImageSlice.newInstance();
    resliceActor.setMapper(resliceMapper);

    const actor = vtkImageSlice.newInstance();
    const mapper = vtkImageCPRMapper.newInstance();
    mapper.setBackgroundColor(0, 0, 0, 0);
    actor.setMapper(mapper);

    mapper.setInputConnection(reader.getOutputPort(), 0);
    mapper.setInputData(centerline, 1);
    mapper.setWidth(0);

    const cprManipulator = vtkCPRManipulator.newInstance({
        cprActor: actor,
    });
    const planeManipulator = vtkPlaneManipulator.newInstance();

    const interactor = renderWindow.getInteractor();
    interactor.setInteractorStyle(vtkInteractorStyleImage.newInstance());
    interactor.setDesiredUpdateRate(15.0);

    return {
        widgetState: widgetState,
        stretchViewType: stretchViewType,
        crossViewType: crossViewType,
        cprManipulator: cprManipulator,
        mapper: mapper,
        widget: widget,
        reslice: reslice,
        actor: actor,
        resliceActor: resliceActor,
        crossRenderer: crossRenderer,
        planeManipulator: planeManipulator,
        stretchRenderer: stretchRenderer,
        interactor: interactor,
        renderWindow: renderWindow,
        stretchViewWidgetInstance: stretchViewWidgetInstance,
        crossViewWidgetInstance: crossViewWidgetInstance
    }
}

const cprContext = cpr()
function updateDistanceAndDirection() {
    // Directions and position in world space from the widget
    const widgetPlanes = cprContext.widgetState.getPlanes();
    widgetPlanes[cprContext.stretchViewType].normal = [0, 0, 1]
    widgetPlanes[cprContext.stretchViewType].viewUp = [-1, 0, 0];
    const worldBitangent = widgetPlanes[cprContext.stretchViewType].normal;
    const worldNormal = widgetPlanes[cprContext.stretchViewType].viewUp;

    // widgetPlanes[crossViewType].normal = worldNormal;
    // widgetPlanes[crossViewType].viewUp = worldBitangent;
    widgetPlanes[cprContext.crossViewType].normal = [0, 0, 1];
    widgetPlanes[cprContext.crossViewType].viewUp = [0, -1, 0];
    const worldTangent = vec3.cross([], worldBitangent, worldNormal);

    vec3.normalize(worldTangent, worldTangent);
    // console.log(worldBitangent, worldNormal, worldTangent, )
    const worldWidgetCenter = cprContext.widgetState.getCenter();
    const distance = cprContext.cprManipulator.getCurrentDistance();

    // CPR mapper tangent and bitangent directions update
    const { orientation } = cprContext.mapper.getCenterlinePositionAndOrientation(distance);
    // modelDirections * baseDirections = worldDirections
    // => baseDirections = modelDirections^(-1) * worldDirections
    const modelDirections = mat3.fromQuat([], orientation);
    const inverseModelDirections = mat3.invert([], modelDirections);
    const worldDirections = mat3.fromValues(
        ...worldBitangent,
        ...worldNormal,
        ...worldTangent,
    );
    const baseDirections = mat3.mul([], inverseModelDirections, worldDirections);
    // const baseDirections = worldDirections;
    cprContext.mapper.setDirectionMatrix(baseDirections);

    // Cross renderer update
    // cprContext.widget.updateReslicePlane(cprContext.reslice, cprContext.crossViewType);
    cprContext.resliceActor.setUserMatrix(cprContext.reslice.getResliceAxes());
    // cprContext.widget.updateCameraPoints(cprContext.crossRenderer, cprContext.crossViewType, false, false);
    const crossCamera = cprContext.crossRenderer.getActiveCamera();
    crossCamera.setViewUp(
        modelDirections[3],
        modelDirections[4],
        modelDirections[5]
    );

    // Update plane manipulator origin / normal for the cross view
    cprContext.planeManipulator.setUserOrigin(worldWidgetCenter);
    cprContext.planeManipulator.setUserNormal(worldNormal);

    // Find the angle
    const signedRadAngle = Math.atan2(baseDirections[1], baseDirections[0]);
    const signedDegAngle = (signedRadAngle * 180) / Math.PI;
    const degAngle = signedDegAngle > 0 ? signedDegAngle : 360 + signedDegAngle;

    updateState(
        cprContext.widgetState,
        cprContext.widget.getScaleInPixels(),
        cprContext.widget.getRotationHandlePosition()
    );

    const width = cprContext.mapper.getWidth();
    const height = cprContext.mapper.getHeight();

    // CPR actor matrix update
    const worldActorTranslation = vec3.scaleAndAdd(
        [],
        worldWidgetCenter,
        worldTangent,
        -0.5 * width
    );
    vec3.scaleAndAdd(
        worldActorTranslation,
        worldActorTranslation,
        worldNormal,
        distance - height
    );
    const worldActorTransform = mat4.fromValues(
        ...worldTangent,
        0,
        ...worldNormal,
        0,
        ...vec3.scale([], worldBitangent, -1),
        0,
        ...worldActorTranslation,
        1
    );
    cprContext.actor.setUserMatrix(worldActorTransform);

    // CPR camera reset
    const stretchCamera = cprContext.stretchRenderer.getActiveCamera();
    const cameraDistance =
        (0.5 * height) /
        Math.tan(radiansFromDegrees(0.5 * stretchCamera.getViewAngle()));
    stretchCamera.setParallelScale(0.5 * height);
    stretchCamera.setParallelProjection(true);
    const cameraFocalPoint = vec3.scaleAndAdd(
        [],
        worldWidgetCenter,
        worldNormal,
        distance - 0.5 * height
    );
    const cameraPosition = vec3.scaleAndAdd(
        [],
        cameraFocalPoint,
        worldBitangent,
        -cameraDistance
    );
    stretchCamera.setPosition(...cameraPosition);
    stretchCamera.setFocalPoint(...cameraFocalPoint);
    stretchCamera.setViewUp(...worldNormal);
    cprContext.stretchRenderer.resetCameraClippingRange();
    cprContext.interactor.render();

    cprContext.renderWindow.render();
}

viewAttributes.push(obj);

function setCenterlineKey() {
    if (!currentImage) {
        return;
    }
    // Set positions of the centerline (model coordinates)
    const centerlinePoints = Float32Array.from(centerlineJson.position);
    const nPoints = centerlinePoints.length / 3;
    centerline.getPoints().setData(centerlinePoints, 3);

    // Set polylines of the centerline
    const centerlineLines = new Uint16Array(1 + nPoints);
    centerlineLines[0] = nPoints;
    for (let i = 0; i < nPoints; ++i) {
        centerlineLines[i + 1] = i;
    }
    centerline.getLines().setData(centerlineLines);

    // Create a rotated basis data array to oriented the CPR
    centerline.getPointData().setTensors(
        vtkDataArray.newInstance({
            name: 'Orientation',
            numberOfComponents: 16,
            values: Float32Array.from(centerlineJson.orientation),
        })
    );
    centerline.modified();

    const midPointDistance = cprContext.mapper.getHeight() / 2;
    const { worldCoords } = cprContext.cprManipulator.distanceEvent(midPointDistance);
    cprContext.widgetState.setCenter(worldCoords);
    updateDistanceAndDirection();

    widgetState[`getAxis${crossPlane}in${stretchPlane}`]().setManipulator(
        cprContext.cprManipulator
    );
    widgetState[`getAxis${stretchPlane}in${crossPlane}`]().setManipulator(
        cprContext.planeManipulator
    );
    cprContext.widget.setManipulator(cprContext.cprManipulator);

    cprContext.renderWindow.render();
}

// ----------------------------------------------------------------------------
// Load image
// ----------------------------------------------------------------------------

function updateReslice(
    interactionContext = {
        viewType: '',
        reslice: null,
        actor: null,
        renderer: null,
        resetFocalPoint: false, // Reset the focal point to the center of the display image
        computeFocalPointOffset: false, // Defines if the display offset between reslice center and focal point has to be
        // computed. If so, then this offset will be used to keep the focal point position during rotation.
        sphereSources: null,
        slider: null,
    }
) {
    const modified = widget.updateReslicePlane(
        interactionContext.reslice,
        interactionContext.viewType
    );

    // console.log(obj.renderer.getActiveCamera().getFocalPoint(), obj.renderer.getActiveCamera().getPosition())
    if (modified) {
        const resliceAxes = interactionContext.reslice.getResliceAxes();
        // Get returned modified from setter to know if we have to render
        interactionContext.actor.setUserMatrix(resliceAxes);

        const planeSource = widget.getPlaneSource(interactionContext.viewType);
        for (let j = 0; j < numberOfPoints * 3; j+=3) {
            // console.log([centerlineCoors[j], centerlineCoors[j+1], planeSource.getOrigin()[2]])
            interactionContext.sphereSources[j/3].setCenter([centerlineCoors[j], centerlineCoors[j+1], planeSource.getOrigin()[2]])
        }
        // interactionContext.sphereSources[0].setCenter(planeSource.getOrigin());
        // interactionContext.sphereSources[1].setCenter([59.19,79.36,23.75]);
        // interactionContext.sphereSources[2].setCenter(planeSource.getPoint2());

    }
    widget.updateCameraPoints(
        interactionContext.renderer,
        interactionContext.viewType,
        interactionContext.resetFocalPoint,
        interactionContext.computeFocalPointOffset
    );
    return modified;
}

reader.setUrl(`myhanh.vti`).then(() => {
    reader.loadData().then(() => {
        const image = reader.getOutputData();
        widget.setImage(image);

        const obj = viewAttributes[0];

        obj.reslice.setInputData(image);
        obj.renderer.addActor(obj.resliceActor);

        obj.sphereActors.forEach((actor) => {
            obj.renderer.addActor(actor);
        });
        const reslice = obj.reslice;

        const viewType = xyzToViewType[2];

        viewAttributes
            // No need to update plane nor refresh when interaction
            // is on current view. Plane can't be changed with interaction on current
            // view. Refreshs happen automatically with `animation`.
            // Note: Need to refresh also the current view because of adding the mouse wheel
            // to change slicer
            .forEach((v) => {
                // Store the FocalPoint offset before "interacting".
                // The offset may have been changed externally when manipulating the camera
                // or interactorstyle.
                v.widgetInstance.onStartInteractionEvent(() => {
                    updateReslice({
                        viewType,
                        reslice,
                        actor: obj.resliceActor,
                        renderer: obj.renderer,
                        resetFocalPoint: false,
                        computeFocalPointOffset: true,
                        sphereSources: obj.sphereSources,
                        slider: obj.slider,
                    });
                });

                // Interactions in other views may change current plane
                v.widgetInstance.onInteractionEvent(
                    (interactionMethodName) => {
                        // console.log(obj.reslice.getResliceAxes(),
                        //     image.getSpacing(),
                        //     image.getOrigin(),
                        //     image.getExtent())
                        const canUpdateFocalPoint =
                            interactionMethodName === InteractionMethodsName.RotateLine;
                        const activeViewType = widget
                            .getWidgetState()
                            .getActiveViewType();
                        const computeFocalPointOffset =
                            activeViewType === viewType || !canUpdateFocalPoint;
                        updateReslice({
                            viewType,
                            reslice,
                            actor: obj.resliceActor,
                            renderer: obj.renderer,
                            resetFocalPoint: false,
                            computeFocalPointOffset,
                            sphereSources: obj.sphereSources,
                            slider: obj.slider,
                        });
                    }
                );
            });

        currentImage = image;

        updateReslice({
            viewType,
            reslice,
            actor: obj.resliceActor,
            renderer: obj.renderer,
            resetFocalPoint: true, // At first initilization, center the focal point to the image center
            computeFocalPointOffset: true, // Allow to compute the current offset between display reslice center and display focal point
            sphereSources: obj.sphereSources,
            slider: obj.slider,
        });
        cprContext.widget.setImage(image)
        const imageDimensions = image.getDimensions();
        const imageSpacing = image.getSpacing();
        // console.log("DIMENSION:",imageDimensions, imageSpacing)
        const diagonal = vec3.mul([], imageDimensions, imageSpacing);
        cprContext.mapper.setWidth(2 * vec3.len(diagonal));

        cprContext.actor.setUserMatrix(cprContext.widget.getResliceAxes(cprContext.stretchViewType));
        cprContext.stretchRenderer.addVolume(cprContext.actor);
        cprContext.widget.updateCameraPoints(cprContext.stretchRenderer, cprContext.stretchViewType, true, true);

        cprContext.reslice.setInputData(image);
        cprContext.crossRenderer.addActor(cprContext.resliceActor);
        cprContext.widget.updateReslicePlane(cprContext.reslice, cprContext.crossViewType);
        cprContext.resliceActor.setUserMatrix(cprContext.reslice.getResliceAxes());
        widget.updateCameraPoints(cprContext.crossRenderer, cprContext.crossViewType, true, true);

        currentImage = image;
        setCenterlineKey();
        obj.interactor.render();
    });
});
