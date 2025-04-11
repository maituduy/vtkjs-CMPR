import requests
from pathlib import Path 
import pydicom
from io import BytesIO
from dicomweb_client.api import DICOMwebClient


dicomWebServer = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb'
studyIUID = '2.16.840.1.114362.1.11972228.22789312658.616067305.306.2'
seriesIUID = '2.16.840.1.114362.1.11972228.22789312658.616067305.306.3'
client = DICOMwebClient(url=dicomWebServer)


instances = client.search_for_instances(
    study_instance_uid=studyIUID,
    series_instance_uid=seriesIUID
)

boundarySize = 47
for instance in instances:
    sopIUID = instance.get('00080018').get('Value')[0]
    frames = client.retrieve_instance_frames(
        study_instance_uid=studyIUID,
        series_instance_uid=seriesIUID,
        sop_instance_uid=sopIUID,
        frame_numbers=[1]
    )
    dcmObj = pydicom.dcmread(BytesIO(frames[0][115:-boundarySize-4]), force=True)
    dcmObj.file_meta.TransferSyntaxUID = "1.2.840.10008.1.2.4.80"
    # print(dcmObj.PatientID)
    print(frames[0][115:-boundarySize-2])
    break
    