rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /memories/{memoryId}/music/{fileName} {
      allow read: if true;
      allow write: if request.resource.size < 12 * 1024 * 1024
                   && request.resource.contentType.matches('audio/.*');
    }
  }
}
